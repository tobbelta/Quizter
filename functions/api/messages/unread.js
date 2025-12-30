import { ensureDatabase } from '../../lib/ensureDatabase.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const parseLimit = (value, fallback = 200) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 500);
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
    return new Response(JSON.stringify({ success: true, count: 0 }), {
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
      SELECT id, target_type FROM messages
      WHERE ${conditions.join(' OR ')}
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(...bindings).all();

    const rows = results || [];
    const messageIds = rows.map((row) => row.id);
    const stateMap = await loadMessageStates(env.DB, messageIds, userId, deviceId);

    let count = 0;
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
      if (state?.deleted_at) return;
      if (state?.read_at) return;
      count += 1;
    });

    return new Response(JSON.stringify({ success: true, count }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[messages/unread] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message, count: 0 }), {
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
