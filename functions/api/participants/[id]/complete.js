/**
 * PARTICIPANT COMPLETE ENDPOINT
 * Marks participant as completed.
 */

import { ensureDatabase } from '../../../lib/ensureDatabase.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const { method } = request;
  const participantId = params.id;

  await ensureDatabase(env.DB);

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!participantId) {
    return new Response(JSON.stringify({ error: 'Participant id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const participant = await env.DB.prepare('SELECT * FROM participants WHERE id = ?')
      .bind(participantId)
      .first();

    if (!participant) {
      return new Response(JSON.stringify({ error: 'Participant not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const now = Math.floor(Date.now() / 1000);

    await env.DB.prepare('UPDATE participants SET completed_at = ?, last_seen = ? WHERE id = ?')
      .bind(now, now, participantId)
      .run();

    return new Response(JSON.stringify({
      success: true,
      completed_at: now
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[participants/complete] Error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to complete participant',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
