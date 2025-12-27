/**
 * SERVER-SENT EVENTS FOR REAL-TIME GAME UPDATES
 * 
 * Provides live updates for:
 * - Run status changes
 * - New participants joining
 * - Participant heartbeats and completions
 * - New answers submitted
 * - Leaderboard updates
 */

import { ensureDatabase } from '../../lib/ensureDatabase.js';

// Store active SSE connections
const connections = new Map();

const safeJsonParse = (value, fallback) => {
  if (!value || typeof value !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('[SSE] Failed to parse JSON value', error);
    return fallback;
  }
};

export async function onRequest(context) {
  const { request, env } = context;
  const { method, url } = request;

  // Initialize database
  await ensureDatabase(env.DB);

  if (method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const urlParams = new URL(url).searchParams;
  const runId = urlParams.get('runId');
  const participantId = urlParams.get('participantId');

  if (!runId) {
    return new Response(JSON.stringify({ 
      error: 'runId parameter required' 
    }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const isAdminStream = runId === 'admin';
    if (!isAdminStream) {
      // Validate run exists
      const run = await env.DB.prepare('SELECT id, status FROM runs WHERE id = ?').bind(runId).first();
      
      if (!run) {
        return new Response(JSON.stringify({ error: 'Run not found' }), { 
          status: 404, 
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Create SSE stream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Generate connection ID
    const connectionId = crypto.randomUUID();
    
    // Store connection info
    connections.set(connectionId, {
      writer,
      runId,
      participantId,
      connectedAt: Date.now()
    });

    const sendInitialState = async () => {
      await sendSSEMessage(writer, encoder, 'connected', {
        connectionId,
        runId,
        participantId,
        timestamp: Date.now()
      });

      if (isAdminStream) {
        const currentState = await getCurrentAdminState(env.DB);
        await sendSSEMessage(writer, encoder, null, currentState);
      } else {
        const currentState = await getCurrentRunState(env.DB, runId);
        await sendSSEMessage(writer, encoder, 'initial-state', currentState);
      }
    };

    if (typeof context.waitUntil === 'function') {
      context.waitUntil(sendInitialState());
    } else {
      sendInitialState().catch((error) => {
        console.error('[SSE] Failed to send initial state:', error);
      });
    }

    // Set up cleanup on disconnect
    const cleanup = () => {
      connections.delete(connectionId);
      console.log(`[SSE] Connection ${connectionId} cleaned up`);
    };

    // Auto-cleanup after 30 minutes (Cloudflare Workers timeout)
    const timeout = setTimeout(() => {
      cleanup();
      writer.close();
    }, 30 * 60 * 1000);

    // Handle client disconnect
    request.signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      cleanup();
      writer.close();
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    });

  } catch (error) {
    console.error('[SSE] Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      details: error.message 
    }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Send SSE formatted message
 */
async function sendSSEMessage(writer, encoder, event, data) {
  try {
    const message = event
      ? `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      : `data: ${JSON.stringify(data)}\n\n`;
    const writePromise = writer.write(encoder.encode(message));
    writePromise.catch((error) => {
      console.error('[SSE] Failed to write message:', error);
    });
  } catch (error) {
    console.error('[SSE] Failed to send message:', error);
  }
}

/**
 * Get current state for admin streams (list all runs).
 */
async function getCurrentAdminState(db) {
  try {
    const runsResult = await db.prepare('SELECT * FROM runs ORDER BY created_at DESC').all();
    const runs = (runsResult.results || []).map((run) => ({
      ...run,
      question_ids: safeJsonParse(run.question_ids, []),
      checkpoints: safeJsonParse(run.checkpoints, []),
      route: safeJsonParse(run.route, null),
    }));

    return {
      runs,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('[SSE] Error getting admin state:', error);
    return { error: 'Failed to get admin state' };
  }
}

/**
 * Get current run state for initial load
 */
async function getCurrentRunState(db, runId) {
  try {
    // Get run details
    const runStmt = db.prepare(`
      SELECT r.*, u.display_name as creator_name
      FROM runs r 
      LEFT JOIN users u ON r.created_by = u.id 
      WHERE r.id = ?
    `);
    const run = await runStmt.bind(runId).first();

    if (!run) {
      return { error: 'Run not found' };
    }

    // Parse JSON fields
    const processedRun = {
      ...run,
      question_ids: safeJsonParse(run.question_ids, []),
      checkpoints: safeJsonParse(run.checkpoints, []),
      route: safeJsonParse(run.route, null),
    };

    // Get participants
    const participantsStmt = db.prepare(`
      SELECT p.*, u.display_name as user_name
      FROM participants p 
      LEFT JOIN users u ON p.user_id = u.id 
      WHERE p.run_id = ? 
      ORDER BY p.joined_at ASC
    `);
    const participantsResult = await participantsStmt.bind(runId).all();
    const participants = participantsResult.results || [];

    // Get leaderboard
    const leaderboardStmt = db.prepare(`
      SELECT 
        p.id as participant_id,
        p.alias,
        p.user_id,
        u.display_name as user_name,
        COUNT(a.id) as total_answers,
        COUNT(CASE WHEN a.is_correct = 1 THEN 1 END) as correct_answers,
        ROUND(
          CASE 
            WHEN COUNT(a.id) > 0 
            THEN (COUNT(CASE WHEN a.is_correct = 1 THEN 1 END) * 100.0 / COUNT(a.id))
            ELSE 0 
          END
        ) as score_percentage,
        MAX(a.answered_at) as last_answer_at,
        p.completed_at
      FROM participants p 
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN answers a ON p.id = a.participant_id
      WHERE p.run_id = ?
      GROUP BY p.id, p.alias, p.user_id, u.display_name, p.completed_at
      ORDER BY score_percentage DESC, last_answer_at ASC
    `);
    const leaderboardResult = await leaderboardStmt.bind(runId).all();
    const leaderboard = leaderboardResult.results || [];

    return {
      run: processedRun,
      participants,
      leaderboard,
      timestamp: Date.now()
    };

  } catch (error) {
    console.error('[SSE] Error getting current state:', error);
    return { error: 'Failed to get current state' };
  }
}

/**
 * Broadcast update to all connections for a run
 * This should be called from other API endpoints when state changes
 */
export async function broadcastToRun(runId, eventType, data) {
  console.log(`[SSE] Broadcasting ${eventType} to run ${runId}`);
  
  const encoder = new TextEncoder();
  const connectionsToUpdate = Array.from(connections.values()).filter(conn => conn.runId === runId);
  
  if (connectionsToUpdate.length === 0) {
    console.log(`[SSE] No active connections for run ${runId}`);
    return;
  }

  const updatePromises = connectionsToUpdate.map(async (connection) => {
    try {
      await sendSSEMessage(connection.writer, encoder, eventType, {
        ...data,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[SSE] Failed to broadcast to connection:', error);
      // Remove failed connection
      for (const [id, conn] of connections.entries()) {
        if (conn === connection) {
          connections.delete(id);
          break;
        }
      }
    }
  });

  await Promise.all(updatePromises);
  console.log(`[SSE] Broadcasted to ${connectionsToUpdate.length} connections`);
}

/**
 * Utility function to trigger broadcasts from other endpoints
 * Usage: import { triggerBroadcast } from '../sse/index.js'
 */
export async function triggerBroadcast(runId, eventType, data) {
  // In a real production environment, you might use Durable Objects or pub/sub
  // For now, we'll use the in-memory connections map
  await broadcastToRun(runId, eventType, data);
}
