/**
 * Email logs API (superuser)
 */
import { ensureDatabase } from '../lib/ensureDatabase.js';
import { getEmailSettingsSnapshot } from '../lib/emailSettings.js';
import { pruneEmailEvents } from '../lib/emailLogs.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const isSuperUserRequest = (request, env) => {
  const userEmail = request.headers.get('x-user-email');
  const superuserEmail = env.SUPERUSER_EMAIL || 'admin@admin.se';
  if (!userEmail) return false;
  return userEmail.toLowerCase() === superuserEmail.toLowerCase();
};

const normalizeStatus = (value) => {
  if (!value) return null;
  const status = String(value).toLowerCase();
  if (status === 'sent' || status === 'failed') return status;
  return null;
};

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!isSuperUserRequest(request, env)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 403,
      headers: jsonHeaders,
    });
  }

  try {
    await ensureDatabase(env.DB);
    await pruneEmailEvents(env);

    const { searchParams } = new URL(request.url);
    const status = normalizeStatus(searchParams.get('status'));
    const providerId = searchParams.get('providerId');
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    const clauses = [];
    const params = [];
    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    if (providerId) {
      clauses.push('provider_id = ?');
      params.push(providerId);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const countRow = await env.DB.prepare(`SELECT COUNT(*) as count FROM email_events ${whereClause}`)
      .bind(...params)
      .first();

    const results = await env.DB.prepare(
      `SELECT * FROM email_events ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();

    const { settings } = await getEmailSettingsSnapshot(env, { includeSecrets: false });

    return new Response(JSON.stringify({
      success: true,
      logs: results.results || [],
      total: Number(countRow?.count || 0),
      limit,
      offset,
      retentionDays: settings.retentionDays || 90
    }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[emailLogs] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: jsonHeaders,
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
