import { ensureDatabase } from '../../lib/ensureDatabase.js';
import { sendEmail } from '../../lib/emailSender.js';
import { buildVerificationEmail } from '../../lib/verificationEmail.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.json();
    const name = String(payload?.name || '').trim();
    const email = normalizeEmail(payload?.email);

    if (!name || !email) {
      return new Response(JSON.stringify({ success: false, error: 'Namn och e-post krävs.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    await ensureDatabase(env.DB);

    const existing = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (existing) {
      return new Response(JSON.stringify({ success: false, error: 'E-postadressen är redan registrerad.' }), {
        status: 409,
        headers: jsonHeaders,
      });
    }

    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const now = Date.now();

    const isSuperUser = Boolean(env.SUPERUSER_EMAIL && email === env.SUPERUSER_EMAIL.toLowerCase());

    const userId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO users (id, email, display_name, created_at, is_super_user, email_verified, verification_token, verification_expires, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(userId, email, name, now, isSuperUser ? 1 : 0, 0, token, expiresAt, now).run();

    const baseUrl = env.APP_BASE_URL || new URL(request.url).origin;
    const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const { subject, text, html } = buildVerificationEmail({ name, verifyUrl });

    await sendEmail(env, {
      to: email,
      subject,
      text,
      html
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[auth/register] Error:', error);
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
