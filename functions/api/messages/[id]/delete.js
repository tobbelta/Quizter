import { ensureDatabase } from '../../../lib/ensureDatabase.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const resolveRecipient = (targetType, payload) => {
  const userId = payload?.userId || null;
  const deviceId = payload?.deviceId || null;

  if (targetType === 'device') {
    return deviceId ? { type: 'device', id: deviceId } : null;
  }
  if (targetType === 'user') {
    return userId ? { type: 'user', id: userId } : null;
  }
  if (userId) return { type: 'user', id: userId };
  if (deviceId) return { type: 'device', id: deviceId };
  return null;
};

export async function onRequestPost(context) {
  const { request, env, params } = context;

  try {
    const payload = await request.json();
    await ensureDatabase(env.DB);

    const message = await env.DB.prepare('SELECT target_type FROM messages WHERE id = ?')
      .bind(params.id)
      .first();
    if (!message) {
      return new Response(JSON.stringify({ success: false, error: 'Meddelandet hittades inte.' }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    const recipient = resolveRecipient(message.target_type, payload);
    if (!recipient) {
      return new Response(JSON.stringify({ success: false, error: 'Mottagare saknas.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }
    const now = Date.now();

    await env.DB.prepare(`
      INSERT INTO message_states (
        message_id, recipient_type, recipient_id, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id, recipient_type, recipient_id)
      DO UPDATE SET deleted_at = excluded.deleted_at, updated_at = excluded.updated_at
    `).bind(
      params.id,
      recipient.type,
      recipient.id,
      now,
      now,
      now
    ).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[messages/delete] Error:', error);
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
    },
  });
}
