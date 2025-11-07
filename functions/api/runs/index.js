/**
 * RUNS API ENDPOINTS - SIMPLIFIED VERSION
 */

import { ensureDatabase } from '../../lib/ensureDatabase.js';

// Helper för att generera unika join codes
function generateJoinCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper för att säkerställa unik join code
async function generateUniqueJoinCode(db) {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const code = generateJoinCode();
    const existing = await db.prepare('SELECT id FROM runs WHERE join_code = ?').bind(code).first();
    
    if (!existing) {
      return code;
    }
    attempts++;
  }
  
  throw new Error('Could not generate unique join code after ' + maxAttempts + ' attempts');
}

export async function onRequest(context) {
  const { request, env } = context;
  const { method } = request;
  const url = new URL(request.url);
  const { pathname } = url;

  // Initialize database
  await ensureDatabase(env.DB);

  // Parse path segments
  const pathSegments = pathname.split('/').filter(Boolean);
  const runId = pathSegments[2]; // /api/runs/{runId}

  try {
    switch (method) {
      case 'GET':
        if (!runId) {
          // GET /api/runs - List all runs
          return await listRuns(env.DB);
        } else {
          // GET /api/runs/{id} - Get specific run
          return await getRun(env.DB, runId);
        }

      case 'POST':
        if (!runId) {
          // POST /api/runs - Create new run
          const body = await request.json();
          return await createRun(env.DB, body);
        }
        break;

      case 'DELETE':
        if (runId) {
          // DELETE /api/runs/{id} - Delete specific run
          return await deleteRun(env.DB, runId);
        }
        break;

      default:
        return new Response('Method not allowed', { status: 405 });
    }

    return new Response('Not found', { status: 404 });

  } catch (error) {
    console.error('[runs] Error:', error);
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
 * List all runs
 */
async function listRuns(db) {
  const runs = await db.prepare('SELECT * FROM runs ORDER BY created_at DESC').all();
  
  // Parse JSON fields
  const processedRuns = runs.results?.map(run => ({
    ...run,
    question_ids: run.question_ids ? JSON.parse(run.question_ids) : [],
    checkpoints: run.checkpoints ? JSON.parse(run.checkpoints) : [],
    route: run.route ? JSON.parse(run.route) : null,
  })) || [];

  return new Response(JSON.stringify({ 
    runs: processedRuns 
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
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
 * Create new run
 */
async function createRun(db, data) {
  const { 
    name, 
    question_ids = [], 
    checkpoints = [], 
    route = null 
  } = data;

  if (!name) {
    return new Response(JSON.stringify({ 
      error: 'Missing required field: name' 
    }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const runId = crypto.randomUUID();
    console.log('Creating run with ID:', runId);
    
    // Generate unique join code
    const joinCode = await generateUniqueJoinCode(db);
    const now = Date.now();
    
    // Create run in database
    await db.prepare('INSERT INTO runs (id, name, join_code, created_by, created_at, status, question_ids, checkpoints, route, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
      runId,
      name,
      joinCode,
      null, // created_by set to NULL
      Math.floor(now / 1000),
      'active',
      JSON.stringify(question_ids),
      JSON.stringify(checkpoints),
      route ? JSON.stringify(route) : null,
      Math.floor(now / 1000)
    ).run();
    
    console.log('Run created successfully!');
    
    const createdRun = {
      id: runId,
      name,
      join_code: joinCode,
      status: 'active',
      created_at: Math.floor(now / 1000),
      question_ids,
      checkpoints,
      route
    };

    return new Response(JSON.stringify({
      success: true,
      run: createdRun
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

    } catch (error) {
    console.error('Error creating run:', error);
    return new Response(JSON.stringify({
      error: 'Failed to create run',
      details: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
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