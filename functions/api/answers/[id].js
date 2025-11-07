/**
 * ANSWERS API - Dynamic ID Route
 * Handles DELETE for specific answer by ID
 */

import { ensureDatabase } from '../../lib/ensureDatabase.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const { method } = request;
  const answerId = params.id;

  // Initialize database
  await ensureDatabase(env.DB);

  try {
    switch (method) {
      case 'DELETE':
        return await deleteAnswer(env.DB, answerId);

      default:
        return new Response('Method not allowed', { status: 405 });
    }

  } catch (error) {
    console.error('[answers/id] Error:', error);
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
 * Delete answer by ID
 */
async function deleteAnswer(db, answerId) {
  const answer = await db.prepare('SELECT * FROM answers WHERE id = ?').bind(answerId).first();
  
  if (!answer) {
    return new Response(JSON.stringify({ error: 'Answer not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Delete answer
  await db.prepare('DELETE FROM answers WHERE id = ?').bind(answerId).run();

  return new Response(JSON.stringify({ 
    success: true,
    message: 'Answer deleted successfully'
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}
