import { ensureDatabase } from '../../lib/ensureDatabase.js';
import { verifyPassword } from '../../lib/passwords.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.json();
    const email = normalizeEmail(payload?.email);
    const password = String(payload?.password || '');

    if (!email || !password) {
      return new Response(JSON.stringify({ success: false, error: 'E-post och lösenord krävs.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    await ensureDatabase(env.DB);

    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Felaktiga inloggningsuppgifter.' }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    if (!(user.email_verified === 1 || user.email_verified === true)) {
      return new Response(JSON.stringify({ success: false, error: 'Du måste verifiera din e-post innan du kan logga in.' }), {
        status: 403,
        headers: jsonHeaders,
      });
    }

    if (!user.password_hash || !user.password_salt) {
      return new Response(JSON.stringify({ success: false, error: 'Kontot är inte aktiverat ännu.' }), {
        status: 403,
        headers: jsonHeaders,
      });
    }

    const validPassword = await verifyPassword(password, user.password_hash, user.password_salt);
    if (!validPassword) {
      return new Response(JSON.stringify({ success: false, error: 'Felaktiga inloggningsuppgifter.' }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const isSuperUser = Boolean(email && env.SUPERUSER_EMAIL && email === env.SUPERUSER_EMAIL.toLowerCase());

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        name: user.display_name || user.email || 'Användare',
        email: user.email,
        contact: user.email,
        emailVerified: user.email_verified === 1 || user.email_verified === true,
        isAnonymous: false,
        isSuperUser
      }
    }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[auth/login] Error:', error);
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
