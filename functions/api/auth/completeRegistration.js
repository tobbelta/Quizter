import { ensureDatabase } from '../../lib/ensureDatabase.js';
import { hashPassword } from '../../lib/passwords.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.json();
    const token = String(payload?.token || '').trim();
    const password = String(payload?.password || '');

    if (!token || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Token och lösenord krävs.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    if (password.length < 8) {
      return new Response(JSON.stringify({ success: false, error: 'Lösenordet måste vara minst 8 tecken.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    await ensureDatabase(env.DB);

    const user = await env.DB.prepare('SELECT * FROM users WHERE verification_token = ?').bind(token).first();
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Ogiltig verifieringslänk.' }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    const expires = Number(user.verification_expires || 0);
    if (expires && Date.now() > expires) {
      return new Response(JSON.stringify({ success: false, error: 'Verifieringslänken har gått ut.' }), {
        status: 410,
        headers: jsonHeaders,
      });
    }

    const { hash, salt } = await hashPassword(password);
    const now = Date.now();

    await env.DB.prepare(
      `UPDATE users
       SET password_hash = ?, password_salt = ?, email_verified = 1,
           verification_token = NULL, verification_expires = NULL, updated_at = ?
       WHERE id = ?`
    ).bind(hash, salt, now, user.id).run();

    const email = normalizeEmail(user.email);
    const isSuperUser = Boolean(email && env.SUPERUSER_EMAIL && email === env.SUPERUSER_EMAIL.toLowerCase());

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        name: user.display_name || user.email || 'Användare',
        email: user.email,
        contact: user.email,
        emailVerified: true,
        isAnonymous: false,
        isSuperUser
      }
    }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[auth/completeRegistration] Error:', error);
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
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
