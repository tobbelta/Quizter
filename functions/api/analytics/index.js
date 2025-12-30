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

const parseLimit = (value, fallback = 100) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 500);
};

const parseTimestamp = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.getTime();
  }
  return null;
};

const toJson = (value) => {
  if (!value) return null;
  try {
    return JSON.stringify(value);
  } catch (error) {
    return null;
  }
};

const parseJson = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const normalizeEvent = (row) => ({
  id: row.id,
  deviceId: row.device_id,
  userId: row.user_id,
  eventType: row.event_type,
  timestamp: row.timestamp,
  deviceType: row.device_type,
  os: row.os,
  browser: row.browser,
  timezone: row.timezone,
  userAgent: row.user_agent,
  language: row.language,
  screenResolution: row.screen_resolution,
  path: row.path,
  metadata: parseJson(row.metadata),
  createdAt: row.created_at,
});

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.json();
    const deviceId = String(payload?.deviceId || '').trim();
    const eventType = String(payload?.eventType || '').trim();
    const timestamp = parseTimestamp(payload?.timestamp) || Date.now();

    if (!deviceId || !eventType) {
      return new Response(JSON.stringify({ success: false, error: 'deviceId och eventType krävs.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    await ensureDatabase(env.DB);

    const now = Date.now();
    const metadata = toJson(payload?.metadata);

    await env.DB.prepare(`
      INSERT INTO analytics_events (
        id, device_id, user_id, event_type, timestamp, device_type, os, browser,
        timezone, user_agent, language, screen_resolution, path, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      deviceId,
      payload?.userId || null,
      eventType,
      timestamp,
      payload?.deviceType || null,
      payload?.os || null,
      payload?.browser || null,
      payload?.timezone || null,
      payload?.userAgent || null,
      payload?.language || null,
      payload?.screenResolution || null,
      payload?.path || null,
      metadata,
      now
    ).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[analytics] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (!isSuperUserRequest(request, env)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 403,
      headers: jsonHeaders,
    });
  }

  try {
    await ensureDatabase(env.DB);

    const limit = parseLimit(url.searchParams.get('limit'));
    const deviceId = url.searchParams.get('deviceId');
    const userId = url.searchParams.get('userId');
    const eventType = url.searchParams.get('eventType');
    const since = parseTimestamp(url.searchParams.get('since'));
    const until = parseTimestamp(url.searchParams.get('until'));

    const conditions = [];
    const bindings = [];

    if (deviceId) {
      conditions.push('device_id = ?');
      bindings.push(deviceId);
    }
    if (userId) {
      conditions.push('user_id = ?');
      bindings.push(userId);
    }
    if (eventType) {
      conditions.push('event_type = ?');
      bindings.push(eventType);
    }
    if (since) {
      conditions.push('timestamp >= ?');
      bindings.push(since);
    }
    if (until) {
      conditions.push('timestamp <= ?');
      bindings.push(until);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    bindings.push(limit);

    const { results } = await env.DB.prepare(`
      SELECT * FROM analytics_events
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ?
    `).bind(...bindings).all();

    return new Response(JSON.stringify({ success: true, events: (results || []).map(normalizeEvent) }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[analytics] Error:', error);
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
