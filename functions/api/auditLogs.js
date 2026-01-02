import { ensureDatabase } from '../lib/ensureDatabase.js';
import { ensureAuditLogsSchema } from '../lib/auditLogs.js';

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

const parseLimit = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 50;
  return Math.min(200, Math.max(1, Math.round(numeric)));
};

const parseOffset = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
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
    await ensureAuditLogsSchema(env.DB);

    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const offset = parseOffset(searchParams.get('offset'));
    const targetType = String(searchParams.get('targetType') || '').trim();
    const actorEmail = String(searchParams.get('actorEmail') || '').trim().toLowerCase();
    const action = String(searchParams.get('action') || '').trim();

    const filters = [];
    const values = [];

    if (targetType) {
      filters.push('target_type = ?');
      values.push(targetType);
    }
    if (actorEmail) {
      filters.push('LOWER(actor_email) LIKE ?');
      values.push(`%${actorEmail}%`);
    }
    if (action) {
      filters.push('action = ?');
      values.push(action);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const result = await env.DB.prepare(
      `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...values, limit, offset).all();

    const logs = (result.results || []).map((row) => {
      let details = null;
      if (row.details) {
        try {
          details = JSON.parse(row.details);
        } catch (error) {
          details = row.details;
        }
      }
      return {
        id: row.id,
        actorId: row.actor_id || null,
        actorEmail: row.actor_email || null,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id || null,
        details,
        createdAt: row.created_at
      };
    });

    return new Response(JSON.stringify({ success: true, logs }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[auditLogs] Error:', error);
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
