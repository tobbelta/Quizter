/**
 * PARTICIPANTS API ENDPOINTS - CLEAN VERSION
 */

import { ensureDatabase } from '../../lib/ensureDatabase.js';

export async function onRequest(context) {
  const { request, env } = context;
  const { method, url } = request;
  const { pathname } = new URL(url);

  // Initialize database
  await ensureDatabase(env.DB);

  // Parse path segments
  const pathSegments = pathname.split('/').filter(Boolean);
  const participantId = pathSegments[2]; // /api/participants/{participantId}

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
        } else {
          // POST /api/participants/{id}/heartbeat - Update last seen
          return await heartbeatParticipant(env.DB, participantId);
        }

      case 'DELETE':
        if (participantId) {
          // DELETE /api/participants/{id} - Delete specific participant
          return await deleteParticipant(env.DB, participantId);
        }
        break;

      default:
        return new Response('Method not allowed', { status: 405 });
    }

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
 * List participants for a run
 */
async function listParticipants(db, runId) {
  const participants = await db.prepare('SELECT * FROM participants WHERE run_id = ? ORDER BY joined_at ASC').bind(runId).all();
  
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
  const participant = await db.prepare('SELECT * FROM participants WHERE id = ?').bind(participantId).first();
  
  if (!participant) {
    return new Response(JSON.stringify({ error: 'Participant not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ 
    participant: participant 
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
  const run = await db.prepare('SELECT id, status FROM runs WHERE id = ? AND status = ?').bind(run_id, 'active').first();
  
  if (!run) {
    return new Response(JSON.stringify({ 
      error: 'Run not found or closed' 
    }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check if alias is already taken in this run
  const existingAlias = await db.prepare('SELECT id FROM participants WHERE run_id = ? AND alias = ?').bind(run_id, alias).first();
  
  if (existingAlias) {
    return new Response(JSON.stringify({ 
      error: 'Alias already taken in this run' 
    }), { 
      status: 409, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const participantId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    // Create participant
    await db.prepare('INSERT INTO participants (id, run_id, user_id, alias, joined_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)').bind(
      participantId,
      run_id,
      user_id,
      alias,
      now,
      now
    ).run();

    console.log('Participant registered successfully:', participantId);

    const participant = {
      id: participantId,
      run_id: run_id,
      user_id: user_id,
      alias: alias,
      joined_at: now,
      last_seen: now,
      completed_at: null
    };

    return new Response(JSON.stringify({
      success: true,
      participant: participant
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error registering participant:', error);
    return new Response(JSON.stringify({
      error: 'Failed to register participant',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Update participant heartbeat
 */
async function heartbeatParticipant(db, participantId) {
  try {
    const now = Math.floor(Date.now() / 1000);
    
    const result = await db.prepare('UPDATE participants SET last_seen = ? WHERE id = ?').bind(now, participantId).run();
    
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

  } catch (error) {
    console.error('Error updating heartbeat:', error);
    return new Response(JSON.stringify({
      error: 'Failed to update heartbeat',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Delete participant by ID
 */
async function deleteParticipant(db, participantId) {
  const participant = await db.prepare('SELECT * FROM participants WHERE id = ?').bind(participantId).first();
  
  if (!participant) {
    return new Response(JSON.stringify({ error: 'Participant not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Delete participant (cascade will handle answers)
  await db.prepare('DELETE FROM participants WHERE id = ?').bind(participantId).run();

  return new Response(JSON.stringify({ 
    success: true,
    message: 'Participant deleted successfully'
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}