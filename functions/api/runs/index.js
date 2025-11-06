/**
 * RUNS API ENDPOINTS
 * 
 * Handles game session (run) management operations
 * Migrated from Firebase Firestore to Cloudflare D1 database
 */

import { ensureDatabase } from '../../lib/ensureDatabase.js';
import { triggerBroadcast } from '../sse/index.js';

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
    const existing = await db.prepare('SELECT id FROM runs WHERE join_code = ?').first(code);
    
    if (!existing) {
      return code;
    }
    attempts++;
  }
  
  throw new Error('Could not generate unique join code after ' + maxAttempts + ' attempts');
}

export async function onRequest(context) {
  const { request, env } = context;
  const { method, url } = request;
  const { pathname } = new URL(url);

  // Initialize database
  await ensureDatabase(env.DB);

  // Parse path segments
  const pathSegments = pathname.split('/').filter(Boolean);
  const runId = pathSegments[2]; // /api/runs/{runId}
  const action = pathSegments[3]; // /api/runs/{runId}/{action}

  try {
    switch (method) {
      case 'GET':
        if (!runId) {
          // GET /api/runs - List all runs
          return await listRuns(env.DB);
        } else if (action === 'by-code') {
          // GET /api/runs/{code}/by-code - Get run by join code
          return await getRunByCode(env.DB, runId);
        } else {
          // GET /api/runs/{id} - Get specific run
          return await getRun(env.DB, runId);
        }

      case 'POST':
        if (!runId) {
          // POST /api/runs - Create new run
          const body = await request.json();
          return await createRun(env.DB, body);
        } else if (action === 'close') {
          // POST /api/runs/{id}/close - Close run
          return await closeRun(env.DB, runId);
        }
        break;

      case 'PUT':
        if (runId) {
          // PUT /api/runs/{id} - Update run
          const body = await request.json();
          return await updateRun(env.DB, runId, body);
        }
        break;

      case 'DELETE':
        if (runId) {
          // DELETE /api/runs/{id} - Delete run
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
 * List all runs (admin function)
 */
async function listRuns(db) {
  const stmt = db.prepare(`
    SELECT r.*, u.display_name as creator_name
    FROM runs r 
    LEFT JOIN users u ON r.created_by = u.id 
    ORDER BY r.created_at DESC
  `);
  
  const runs = await stmt.all();
  
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
  const stmt = db.prepare(`
    SELECT r.*, u.display_name as creator_name
    FROM runs r 
    LEFT JOIN users u ON r.created_by = u.id 
    WHERE r.id = ?
  `);
  
  const run = await stmt.first(runId);
  
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
 * Get run by join code
 */
async function getRunByCode(db, joinCode) {
  const stmt = db.prepare(`
    SELECT r.*, u.display_name as creator_name
    FROM runs r 
    LEFT JOIN users u ON r.created_by = u.id 
    WHERE r.join_code = ? AND r.status = 'active'
  `);
  
  const run = await stmt.first(joinCode);
  
  if (!run) {
    return new Response(JSON.stringify({ error: 'Run not found or closed' }), { 
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
    created_by, 
    question_ids = [], 
    checkpoints = [], 
    route = null 
  } = data;

  if (!name || !created_by) {
    return new Response(JSON.stringify({ 
      error: 'Missing required fields: name, created_by' 
    }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const runId = crypto.randomUUID();
  const joinCode = await generateUniqueJoinCode(db);
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO runs (
      id, name, join_code, created_by, created_at, status, 
      question_ids, checkpoints, route
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await stmt.run(
    runId,
    name,
    joinCode,
    created_by,
    now,
    'active',
    JSON.stringify(question_ids),
    JSON.stringify(checkpoints),
    route ? JSON.stringify(route) : null
  );

  // Return the created run
  const createdRun = {
    id: runId,
    name,
    join_code: joinCode,
    created_by,
    created_at: now,
    status: 'active',
    question_ids,
    checkpoints,
    route,
    closed_at: null
  };

  // Broadcast run creation (for admin views)
  try {
    await triggerBroadcast(runId, 'run-created', { run: createdRun });
  } catch (broadcastError) {
    console.warn('[runs] Failed to broadcast run creation:', broadcastError);
  }

  return new Response(JSON.stringify({ 
    run: createdRun 
  }), { 
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Update run
 */
async function updateRun(db, runId, updates) {
  // Validate run exists
  const existingRun = await db.prepare('SELECT id FROM runs WHERE id = ?').first(runId);
  
  if (!existingRun) {
    return new Response(JSON.stringify({ error: 'Run not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Build update query dynamically
  const allowedFields = ['name', 'status', 'question_ids', 'checkpoints', 'route'];
  const updateFields = [];
  const values = [];

  for (const [field, value] of Object.entries(updates)) {
    if (allowedFields.includes(field)) {
      updateFields.push(`${field} = ?`);
      
      // Stringify JSON fields
      if (['question_ids', 'checkpoints', 'route'].includes(field)) {
        values.push(value ? JSON.stringify(value) : null);
      } else {
        values.push(value);
      }
    }
  }

  if (updateFields.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid fields to update' }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  updateFields.push('updated_at = ?');
  values.push(Date.now());
  values.push(runId);

  const stmt = db.prepare(`
    UPDATE runs 
    SET ${updateFields.join(', ')} 
    WHERE id = ?
  `);

  await stmt.run(...values);

  // Return updated run
  return await getRun(db, runId);
}

/**
 * Close run
 */
async function closeRun(db, runId) {
  const stmt = db.prepare(`
    UPDATE runs 
    SET status = 'closed', closed_at = ?, updated_at = ? 
    WHERE id = ? AND status = 'active'
  `);

  const now = Date.now();
  const result = await stmt.run(now, now, runId);

  if (result.changes === 0) {
    return new Response(JSON.stringify({ 
      error: 'Run not found or already closed' 
    }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Run closed successfully' 
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Delete run
 */
async function deleteRun(db, runId) {
  // Check if run exists
  const existingRun = await db.prepare('SELECT id FROM runs WHERE id = ?').first(runId);
  
  if (!existingRun) {
    return new Response(JSON.stringify({ error: 'Run not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Delete run (participants and answers will be cascade deleted due to FK constraints)
  const stmt = db.prepare('DELETE FROM runs WHERE id = ?');
  await stmt.run(runId);

  // Broadcast run deletion
  try {
    await triggerBroadcast(runId, 'run-deleted', { runId });
  } catch (broadcastError) {
    console.warn('[runs] Failed to broadcast run deletion:', broadcastError);
  }

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Run closed successfully' 
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}