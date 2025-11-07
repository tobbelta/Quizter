/**
 * PARTICIPANTS API - Dynamic ID Route
 * Handles GET/DELETE for specific participant by ID
 */

import { ensureDatabase } from '../../lib/ensureDatabase.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const { method } = request;
  const participantId = params.id;

  // Initialize database
  await ensureDatabase(env.DB);

  try {
    switch (method) {
      case 'GET':
        return await getParticipant(env.DB, participantId);

      case 'POST':
        // POST /api/participants/{id} - Heartbeat
        return await heartbeatParticipant(env.DB, participantId);

      case 'DELETE':
        return await deleteParticipant(env.DB, participantId);

      default:
        return new Response('Method not allowed', { status: 405 });
    }

  } catch (error) {
    console.error('[participants/id] Error:', error);
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
 * Get specific participant by ID
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
 * Update participant heartbeat (last_seen timestamp)
 */
async function heartbeatParticipant(db, participantId) {
  try {
    // Check if participant exists
    const participant = await db.prepare('SELECT * FROM participants WHERE id = ?').bind(participantId).first();
    
    if (!participant) {
      return new Response(JSON.stringify({ 
        error: 'Participant not found' 
      }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const now = Math.floor(Date.now() / 1000);

    // Update last_seen timestamp
    await db.prepare('UPDATE participants SET last_seen = ? WHERE id = ?').bind(now, participantId).run();

    console.log('Heartbeat updated for participant:', participantId);

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
