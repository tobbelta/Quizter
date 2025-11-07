/**
 * PARTICIPANTS API ENDPOINTS
 * 
 * Handles participant management for game sessions
 * Migrated from Firebase Firestore to Cloudflare D1 database
 */

import { ensureDatabase } from '../../lib/ensureDatabase.js';
import { triggerBroadcast } from '../sse/index.js';

export async function onRequest(context) {
  const { request, env } = context;
  const { method, url } = request;
  const { pathname } = new URL(url);

  // Initialize database
  await ensureDatabase(env.DB);

  // Parse path segments
  const pathSegments = pathname.split('/').filter(Boolean);
  const participantId = pathSegments[2]; // /api/participants/{participantId}
  const action = pathSegments[3]; // /api/participants/{participantId}/{action}

  try {
    switch (method) {
      case 'GET':
        if (!participantId) {
          // GET /api/participants?runId=xxx - List participants for run
          const urlParams = new URL(url).searchParams;
          const runId = urlParams.get('runId');
          
          if (runId) {
            return await listParticipants(env.DB, runId);
          }
          
          return new Response(JSON.stringify({ 
            error: 'runId parameter required' 
          }), { 
            status: 400, 
            headers: { 'Content-Type': 'application/json' }
          });
          
        } else {
          // GET /api/participants/{id} - Get specific participant
          return await getParticipant(env.DB, participantId);
        }

      case 'POST':
        if (!participantId) {
          // POST /api/participants - Register new participant
          const body = await request.json();
          return await registerParticipant(env.DB, body);
        } else if (action === 'heartbeat') {
          // POST /api/participants/{id}/heartbeat - Update last seen
          return await heartbeatParticipant(env.DB, participantId);
        } else if (action === 'complete') {
          // POST /api/participants/{id}/complete - Mark participant as completed
          return await completeParticipant(env.DB, participantId);
        }
        break;

      case 'PUT':
        if (participantId) {
          // PUT /api/participants/{id} - Update participant
          const body = await request.json();
          return await updateParticipant(env.DB, participantId, body);
        }
        break;

      case 'DELETE':
        if (participantId) {
          // DELETE /api/participants/{id} - Remove participant
          return await removeParticipant(env.DB, participantId);
        }
        break;

      default:
        return new Response('Method not allowed', { status: 405 });
    }

    return new Response('Not found', { status: 404 });

  } catch (error) {
    console.error('[participants] Error:', error);
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
 * List all participants for a run
 */
async function listParticipants(db, runId) {
  // Validate run exists
  const run = await db.prepare('SELECT id, status FROM runs WHERE id = ?').first(runId);
  
  if (!run) {
    return new Response(JSON.stringify({ error: 'Run not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const stmt = db.prepare(`
    SELECT p.*, u.display_name as user_name
    FROM participants p 
    LEFT JOIN users u ON p.user_id = u.id 
    WHERE p.run_id = ? 
    ORDER BY p.joined_at ASC
  `);
  
  const participants = await stmt.all(runId);

  return new Response(JSON.stringify({ 
    participants: participants.results || [] 
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Get specific participant
 */
async function getParticipant(db, participantId) {
  const stmt = db.prepare(`
    SELECT p.*, u.display_name as user_name, r.name as run_name, r.status as run_status
    FROM participants p 
    LEFT JOIN users u ON p.user_id = u.id 
    LEFT JOIN runs r ON p.run_id = r.id 
    WHERE p.id = ?
  `);
  
  const participant = await stmt.first(participantId);
  
  if (!participant) {
    return new Response(JSON.stringify({ error: 'Participant not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ 
    participant 
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Register new participant
 */
async function registerParticipant(db, data) {
  const { run_id, user_id = null, alias } = data;

  if (!run_id || !alias) {
    return new Response(JSON.stringify({ 
      error: 'Missing required fields: run_id, alias' 
    }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Validate run exists and is active
  const run = await db.prepare('SELECT id, status FROM runs WHERE id = ? AND status = ?').first(run_id, 'active');
  
  if (!run) {
    return new Response(JSON.stringify({ 
      error: 'Run not found or closed' 
    }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check if alias is already taken in this run
  const existingAlias = await db.prepare(
    'SELECT id FROM participants WHERE run_id = ? AND alias = ?'
  ).first(run_id, alias);
  
  if (existingAlias) {
    return new Response(JSON.stringify({ 
      error: 'Alias already taken in this run' 
    }), { 
      status: 409, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check if user is already participating in this run
  if (user_id) {
    const existingParticipant = await db.prepare(
      'SELECT id FROM participants WHERE run_id = ? AND user_id = ?'
    ).first(run_id, user_id);
    
    if (existingParticipant) {
      return new Response(JSON.stringify({ 
        error: 'User already participating in this run' 
      }), { 
        status: 409, 
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  const participantId = crypto.randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO participants (id, run_id, user_id, alias, joined_at, last_seen) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  await stmt.run(participantId, run_id, user_id, alias, now, now);

  // Return the created participant
  const createdParticipant = {
    id: participantId,
    run_id,
    user_id,
    alias,
    joined_at: now,
    last_seen: now,
    completed_at: null
  };

  // Broadcast new participant
  try {
    await triggerBroadcast(run_id, 'participant-joined', { participant: createdParticipant });
  } catch (broadcastError) {
    console.warn('[participants] Failed to broadcast participant joined:', broadcastError);
  }

  return new Response(JSON.stringify({ 
    participant: createdParticipant 
  }), { 
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Update participant heartbeat
 */
async function heartbeatParticipant(db, participantId) {
  const stmt = db.prepare(`
    UPDATE participants 
    SET last_seen = ? 
    WHERE id = ?
  `);

  const now = Date.now();
  const result = await stmt.run(now, participantId);

  if (result.changes === 0) {
    return new Response(JSON.stringify({ 
      error: 'Participant not found' 
    }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ 
    success: true, 
    last_seen: now 
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Mark participant as completed
 */
async function completeParticipant(db, participantId) {
  const stmt = db.prepare(`
    UPDATE participants 
    SET completed_at = ?, last_seen = ? 
    WHERE id = ? AND completed_at IS NULL
  `);

  const now = Date.now();
  const result = await stmt.run(now, now, participantId);

  if (result.changes === 0) {
    return new Response(JSON.stringify({ 
      error: 'Participant not found or already completed' 
    }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ 
    success: true, 
    completed_at: now 
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Update participant
 */
async function updateParticipant(db, participantId, updates) {
  // Validate participant exists
  const existing = await db.prepare('SELECT id, run_id FROM participants WHERE id = ?').first(participantId);
  
  if (!existing) {
    return new Response(JSON.stringify({ error: 'Participant not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Build update query dynamically
  const allowedFields = ['alias', 'last_seen'];
  const updateFields = [];
  const values = [];

  for (const [field, value] of Object.entries(updates)) {
    if (allowedFields.includes(field)) {
      updateFields.push(`${field} = ?`);
      values.push(value);
    }
  }

  if (updateFields.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid fields to update' }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check alias uniqueness if updating alias
  if (updates.alias) {
    const existingAlias = await db.prepare(
      'SELECT id FROM participants WHERE run_id = ? AND alias = ? AND id != ?'
    ).first(existing.run_id, updates.alias, participantId);
    
    if (existingAlias) {
      return new Response(JSON.stringify({ 
        error: 'Alias already taken in this run' 
      }), { 
        status: 409, 
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  values.push(participantId);

  const stmt = db.prepare(`
    UPDATE participants 
    SET ${updateFields.join(', ')} 
    WHERE id = ?
  `);

  await stmt.run(...values);

  // Return updated participant
  return await getParticipant(db, participantId);
}

/**
 * Remove participant
 */
async function removeParticipant(db, participantId) {
  // Check if participant exists
  const existing = await db.prepare('SELECT id FROM participants WHERE id = ?').first(participantId);
  
  if (!existing) {
    return new Response(JSON.stringify({ error: 'Participant not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Delete participant (answers will be cascade deleted due to FK constraints)
  const stmt = db.prepare('DELETE FROM participants WHERE id = ?');
  await stmt.run(participantId);

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Participant removed successfully' 
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}