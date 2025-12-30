import { ensureDatabase } from '../../lib/ensureDatabase.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.json();
    const token = String(payload?.token || '').trim();

    if (!token) {
      return new Response(JSON.stringify({ success: false, error: 'Token saknas.' }), {
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

    return new Response(JSON.stringify({
      success: true,
      email: user.email,
      name: user.display_name || ''
    }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[auth/verifyEmail] Error:', error);
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
