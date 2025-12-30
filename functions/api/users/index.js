/**
 * USERS API (superuser)
 * Lists registered users and anonymous participants.
 */

import { ensureDatabase } from '../../lib/ensureDatabase.js';

const normalizeTimestamp = (value) => {
  if (typeof value === 'number') {
    return value < 1e12 ? value * 1000 : value;
  }
  return value;
};

export async function onRequest(context) {
  const { request, env } = context;
  const { method } = request;

  await ensureDatabase(env.DB);

  if (method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const usersResult = await env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    const users = (usersResult.results || []).map((user) => ({
      id: user.id,
      name: user.display_name || user.email || 'Användare',
      email: user.email,
      contact: user.email,
      createdAt: normalizeTimestamp(user.created_at),
      superUser: user.is_super_user === 1 || user.is_super_user === true,
      isAnonymous: false
    }));
    const userMap = new Map(users.map((user) => [user.id, user]));

    const participantsResult = await env.DB.prepare(`
      SELECT id, alias, user_id, device_id, joined_at, last_seen, completed_at
      FROM participants
      ORDER BY joined_at DESC
    `).all();

    const anonymousMap = new Map();
    (participantsResult.results || []).forEach((participant) => {
      if (!participant.user_id) {
        const aliasValue = (participant.alias || 'Anonym').trim();
        const deviceId = String(participant.device_id || '').trim();
        const fallbackKey = aliasValue.toLowerCase() || participant.id;
        const key = deviceId ? `device:${deviceId}` : `anon:${fallbackKey}`;
        const existing = anonymousMap.get(key);
        const nextEntry = {
          id: key,
          name: aliasValue || 'Anonym',
          deviceId: deviceId || null,
          contact: null,
          createdAt: normalizeTimestamp(participant.joined_at),
          lastSeen: normalizeTimestamp(participant.last_seen),
          completedAt: normalizeTimestamp(participant.completed_at),
          superUser: false,
          isAnonymous: true
        };

        if (!existing) {
          anonymousMap.set(key, nextEntry);
        } else {
          const existingLast = existing.lastSeen || existing.createdAt || 0;
          const nextLast = nextEntry.lastSeen || nextEntry.createdAt || 0;
          if (nextLast > existingLast) {
            anonymousMap.set(key, nextEntry);
          }
        }
        return;
      }

      if (!userMap.has(participant.user_id)) {
        userMap.set(participant.user_id, {
          id: participant.user_id,
          name: participant.alias || 'Användare',
          email: null,
          contact: null,
          createdAt: normalizeTimestamp(participant.joined_at),
          lastSeen: normalizeTimestamp(participant.last_seen),
          completedAt: normalizeTimestamp(participant.completed_at),
          superUser: false,
          isAnonymous: false
        });
      }
    });

    const anonymous = Array.from(anonymousMap.values());

    return new Response(JSON.stringify([...userMap.values(), ...anonymous]), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[users] Error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to list users',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
