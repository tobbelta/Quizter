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

const parseLimit = (value, fallback = 50) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 200);
};

const normalizeTargetType = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'user' || normalized === 'device' || normalized === 'all') {
    return normalized;
  }
  return 'all';
};

const toIso = (timestamp) => {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const buildMessageResponse = (row, state) => {
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
    read: Boolean(state?.read_at),
    deleted: Boolean(state?.deleted_at),
  };
};

const loadMessageStates = async (db, messageIds, userId, deviceId) => {
  if (!messageIds.length || (!userId && !deviceId)) return new Map();
  const placeholders = messageIds.map(() => '?').join(',');
  const bindings = [...messageIds];
  const recipientFilters = [];

  if (userId) {
    recipientFilters.push('(recipient_type = ? AND recipient_id = ?)');
    bindings.push('user', userId);
  }
  if (deviceId) {
    recipientFilters.push('(recipient_type = ? AND recipient_id = ?)');
    bindings.push('device', deviceId);
  }

  const { results } = await db.prepare(`
    SELECT * FROM message_states
    WHERE message_id IN (${placeholders})
      AND (${recipientFilters.join(' OR ')})
  `).bind(...bindings).all();

  const stateMap = new Map();
  (results || []).forEach((row) => {
    const current = stateMap.get(row.message_id) || {};
    if (row.recipient_type === 'user') current.user = row;
    if (row.recipient_type === 'device') current.device = row;
    stateMap.set(row.message_id, current);
  });

  return stateMap;
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || null;
  const deviceId = url.searchParams.get('deviceId') || null;
  const limit = parseLimit(url.searchParams.get('limit'));

  if (!userId && !deviceId) {
    return new Response(JSON.stringify({ success: true, messages: [] }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  try {
    await ensureDatabase(env.DB);

    const conditions = ['target_type = ?'];
    const bindings = ['all'];
    if (userId) {
      conditions.push('(target_type = ? AND target_id = ?)');
      bindings.push('user', userId);
    }
    if (deviceId) {
      conditions.push('(target_type = ? AND target_id = ?)');
      bindings.push('device', deviceId);
    }
    bindings.push(limit);

    const { results } = await env.DB.prepare(`
      SELECT * FROM messages
      WHERE ${conditions.join(' OR ')}
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(...bindings).all();

    const rows = results || [];
    const messageIds = rows.map((row) => row.id);
    const stateMap = await loadMessageStates(env.DB, messageIds, userId, deviceId);

    const messages = [];
    rows.forEach((row) => {
      const stateEntry = stateMap.get(row.id);
      let state = null;
      if (row.target_type === 'device') {
        state = stateEntry?.device || null;
      } else if (row.target_type === 'user') {
        state = stateEntry?.user || null;
      } else if (userId && stateEntry?.user) {
        state = stateEntry.user;
      } else if (deviceId && stateEntry?.device) {
        state = stateEntry.device;
      }
      if (state?.deleted_at) {
        return;
      }
      messages.push(buildMessageResponse(row, state));
    });

    return new Response(JSON.stringify({ success: true, messages }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[messages] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message, messages: [] }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!isSuperUserRequest(request, env)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 403,
      headers: jsonHeaders,
    });
  }

  try {
    const payload = await request.json();
    const title = String(payload?.title || '').trim();
    const body = String(payload?.body || payload?.message || '').trim();
    const type = String(payload?.type || 'info').trim();
    const inferredTarget = payload?.targetType
      ? payload.targetType
      : payload?.userId
        ? 'user'
        : payload?.deviceId
          ? 'device'
          : 'all';
    const targetType = normalizeTargetType(inferredTarget);
    const targetId = targetType === 'all'
      ? null
      : String(payload?.targetId || payload?.userId || payload?.deviceId || '').trim();
    const metadata = payload?.metadata || null;

    if (!title || !body) {
      return new Response(JSON.stringify({ success: false, error: 'Titel och meddelande krävs.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    if (targetType !== 'all' && !targetId) {
      return new Response(JSON.stringify({ success: false, error: 'Mottagar-ID krävs.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    await ensureDatabase(env.DB);

    const id = crypto.randomUUID();
    const now = Date.now();
    const adminId = payload?.adminId || request.headers.get('x-user-email') || null;

    await env.DB.prepare(`
      INSERT INTO messages (
        id, title, body, type, target_type, target_id, metadata,
        created_at, updated_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      title,
      body,
      type,
      targetType,
      targetId,
      metadata ? JSON.stringify(metadata) : null,
      now,
      now,
      adminId
    ).run();

    return new Response(JSON.stringify({ success: true, messageId: id }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[messages] Error:', error);
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
    },
  });
}
