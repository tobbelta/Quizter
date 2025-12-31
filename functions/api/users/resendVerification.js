import { ensureDatabase } from '../../lib/ensureDatabase.js';
import { sendEmail } from '../../lib/emailSender.js';
import { buildVerificationEmail } from '../../lib/verificationEmail.js';

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
    const userId = String(payload?.userId || '').trim();
    const email = String(payload?.email || '').trim().toLowerCase();

    if (!userId && !email) {
      return new Response(JSON.stringify({ success: false, error: 'UserId eller e-post krävs.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    await ensureDatabase(env.DB);

    const user = userId
      ? await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first()
      : await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();

    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Användaren hittades inte.' }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    if (user.email_verified === 1 || user.email_verified === true) {
      return new Response(JSON.stringify({ success: false, error: 'Användaren är redan verifierad.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const now = Date.now();

    await env.DB.prepare(
      'UPDATE users SET verification_token = ?, verification_expires = ?, updated_at = ? WHERE id = ?'
    ).bind(token, expiresAt, now, user.id).run();

    const baseUrl = env.APP_BASE_URL || new URL(request.url).origin;
    const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const { subject, text, html } = buildVerificationEmail({ name: user.display_name || '', verifyUrl });

    await sendEmail(env, {
      to: user.email,
      subject,
      text,
      html
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[users/resendVerification] Error:', error);
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
