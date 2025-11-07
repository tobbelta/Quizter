/**
 * RUNS API - Dynamic ID Route
 * Handles GET/DELETE for specific run by ID
 */

import { ensureDatabase } from '../../lib/ensureDatabase.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const { method } = request;
  const runId = params.id;

  // Initialize database
  await ensureDatabase(env.DB);

  try {
    switch (method) {
      case 'GET':
        return await getRun(env.DB, runId);

      case 'DELETE':
        return await deleteRun(env.DB, runId);

      default:
        return new Response('Method not allowed', { status: 405 });
    }

  } catch (error) {
    console.error('[runs/id] Error:', error);
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
 * Get specific run by ID
 */
async function getRun(db, runId) {
  const run = await db.prepare('SELECT * FROM runs WHERE id = ?').bind(runId).first();
  
  if (!run) {
    return new Response(JSON.stringify({ error: 'Run not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Parse JSON fields
  const processedRun = {
    ...run,
    question_ids: run.question_ids ? JSON.parse(run.question_ids) : [],
    checkpoints: run.checkpoints ? JSON.parse(run.checkpoints) : [],
    route: run.route ? JSON.parse(run.route) : null,
  };

  return new Response(JSON.stringify({ 
    run: processedRun 
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Delete run by ID
 */
async function deleteRun(db, runId) {
  const run = await db.prepare('SELECT * FROM runs WHERE id = ?').bind(runId).first();
  
  if (!run) {
    return new Response(JSON.stringify({ error: 'Run not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Delete run (cascade will handle participants and answers)
  await db.prepare('DELETE FROM runs WHERE id = ?').bind(runId).run();

  return new Response(JSON.stringify({ 
    success: true,
    message: 'Run deleted successfully'
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}
