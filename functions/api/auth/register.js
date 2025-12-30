import { ensureDatabase } from '../../lib/ensureDatabase.js';
import { sendEmail } from '../../lib/emailSender.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const buildVerificationEmail = ({ name, verifyUrl }) => {
  const safeName = name ? `Hej ${name}!` : 'Hej!';
  const text = `${safeName}\n\nBekräfta din e-postadress för Quizter genom att öppna länken nedan:\n${verifyUrl}\n\nLänken är giltig i 24 timmar.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <h2>${safeName}</h2>
      <p>Bekräfta din e-postadress för Quizter genom att klicka på länken nedan:</p>
      <p><a href="${verifyUrl}" style="color: #0ea5e9;">Bekräfta e-post</a></p>
      <p style="font-size: 12px; color: #555;">Länken är giltig i 24 timmar.</p>
    </div>
  `;
  return { subject: 'Bekräfta din e-postadress', text, html };
};

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
    if (existing && (existing.email_verified === 1 || existing.email_verified === true) && existing.password_hash) {
      return new Response(JSON.stringify({ success: false, error: 'Kontot finns redan. Logga in istället.' }), {
        status: 409,
        headers: jsonHeaders,
      });
    }

    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const now = Date.now();

    const isSuperUser = Boolean(env.SUPERUSER_EMAIL && email === env.SUPERUSER_EMAIL.toLowerCase());

    if (existing) {
      await env.DB.prepare(
        `UPDATE users
         SET display_name = ?, verification_token = ?, verification_expires = ?, email_verified = 0, is_super_user = ?, updated_at = ?
         WHERE id = ?`
      ).bind(name, token, expiresAt, isSuperUser ? 1 : 0, now, existing.id).run();
    } else {
      const userId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO users (id, email, display_name, created_at, is_super_user, email_verified, verification_token, verification_expires, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(userId, email, name, now, isSuperUser ? 1 : 0, 0, token, expiresAt, now).run();
    }

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
