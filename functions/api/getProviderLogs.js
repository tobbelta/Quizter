/**
 * Cloudflare Pages Function: Get AI provider logs
 * Returns logged provider calls for a background task.
 */
import { ensureDatabase } from '../lib/ensureDatabase.js';
import { ensureProviderCallLogsSchema } from '../lib/providerCallLogs.js';

const isSuperUserRequest = (request, env) => {
  const userEmail = request.headers.get('x-user-email');
  const superuserEmail = env.SUPERUSER_EMAIL || 'admin@admin.se';
  if (!userEmail) return false;
  return userEmail.toLowerCase() === superuserEmail.toLowerCase();
};

const safeParseJson = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const taskId = url.searchParams.get('taskId');
  const limit = Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10));

  if (!isSuperUserRequest(request, env)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (!taskId) {
    return new Response(JSON.stringify({ success: false, error: 'Missing taskId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    await ensureDatabase(env.DB);
    await ensureProviderCallLogsSchema(env.DB);

    const { results } = await env.DB.prepare(
      `SELECT id, task_id, user_id, phase, provider, model, status,
              request_payload, response_payload, error, duration_ms,
              metadata, created_at
       FROM ai_provider_logs
       WHERE task_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    ).bind(taskId, limit).all();

    const logs = (results || []).map((row) => ({
      id: row.id,
      taskId: row.task_id,
      userId: row.user_id,
      phase: row.phase,
      provider: row.provider,
      model: row.model,
      status: row.status,
      requestPayload: safeParseJson(row.request_payload),
      responsePayload: safeParseJson(row.response_payload),
      error: row.error,
      durationMs: row.duration_ms,
      metadata: safeParseJson(row.metadata),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    }));

    return new Response(JSON.stringify({ success: true, logs }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error) {
    console.error('[getProviderLogs] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message, logs: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
    },
  });
}
