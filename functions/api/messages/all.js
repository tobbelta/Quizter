import { ensureDatabase } from '../../lib/ensureDatabase.js';

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

const parseLimit = (value, fallback = 200) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 500);
};

const toIso = (timestamp) => {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get('limit'));

  if (!isSuperUserRequest(request, env)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 403,
      headers: jsonHeaders,
    });
  }

  try {
    await ensureDatabase(env.DB);

    const { results } = await env.DB.prepare(`
      SELECT * FROM messages
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(limit).all();

    const messages = (results || []).map((row) => {
      let metadata = null;
      if (row.metadata) {
        try {
          metadata = JSON.parse(row.metadata);
        } catch (error) {
          metadata = null;
        }
      }

      return {
        id: row.id,
        title: row.title,
        body: row.body,
        message: row.body,
        type: row.type,
        targetType: row.target_type,
        targetId: row.target_id,
        createdBy: row.created_by || null,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        metadata,
      };
    });

    return new Response(JSON.stringify({ success: true, messages }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[messages/all] Error:', error);
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
