import { ensureDatabase } from '../../lib/ensureDatabase.js';
import { hashPassword } from '../../lib/passwords.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isLocalHost = (host) => host === 'localhost' || host === '127.0.0.1';

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  if (!isLocalHost(url.hostname)) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const payload = await request.json();
    const email = normalizeEmail(payload?.email || env.SUPERUSER_EMAIL || 'admin@admin.se');
    const password = String(payload?.password || 'admin');

    if (!email || !password) {
      return new Response(JSON.stringify({ success: false, error: 'E-post och lösenord krävs.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    await ensureDatabase(env.DB);

    const { hash, salt } = await hashPassword(password);
    const now = Date.now();
    const userId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO users (id, email, display_name, created_at, is_super_user, email_verified, password_hash, password_salt, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         display_name = excluded.display_name,
         is_super_user = 1,
         email_verified = 1,
         password_hash = excluded.password_hash,
         password_salt = excluded.password_salt,
         updated_at = excluded.updated_at`
    ).bind(userId, email, 'Admin', now, 1, 1, hash, salt, now).run();

    return new Response(JSON.stringify({ success: true, email }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[dev/seedAdmin] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
}

export async function onRequestOptions({ request }) {
  const url = new URL(request.url);
  if (!isLocalHost(url.hostname)) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
