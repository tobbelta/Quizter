/**
 * RUNS API - Get run by join code
 * GET /api/runs/:code/by-code
 */

import { ensureDatabase } from '../../../lib/ensureDatabase.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const { method } = request;

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
      },
    });
  }

  if (method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const joinCode = params.code ? params.code.toUpperCase() : null;
  if (!joinCode) {
    return new Response(JSON.stringify({ error: 'Missing join code' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  }

  await ensureDatabase(env.DB);

  try {
    const run = await env.DB.prepare('SELECT * FROM runs WHERE join_code = ?')
      .bind(joinCode)
      .first();

    if (!run) {
      return new Response(JSON.stringify({ error: 'Run not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      });
    }

    const processedRun = {
      ...run,
      question_ids: run.question_ids ? JSON.parse(run.question_ids) : [],
      checkpoints: run.checkpoints ? JSON.parse(run.checkpoints) : [],
      route: run.route ? JSON.parse(run.route) : null,
    };

    return new Response(JSON.stringify({ run: processedRun }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[runs/by-code] Error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message,
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  }
}
