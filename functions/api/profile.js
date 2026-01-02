import { ensureDatabase } from '../lib/ensureDatabase.js';
import { verifyPassword, hashPassword } from '../lib/passwords.js';
import { sendEmail } from '../lib/emailSender.js';
import { buildVerificationEmail } from '../lib/verificationEmail.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const buildUserPayload = (user, env) => {
  const email = normalizeEmail(user.email);
  const isSuperUser = Boolean(email && env.SUPERUSER_EMAIL && email === env.SUPERUSER_EMAIL.toLowerCase());
  return {
    id: user.id,
    name: user.display_name || user.email || 'Användare',
    email: user.email,
    contact: user.email,
    emailVerified: user.email_verified === 1 || user.email_verified === true,
    isAnonymous: false,
    isSuperUser
  };
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const userId = request.headers.get('x-user-id');

  if (!userId) {
    return new Response(JSON.stringify({ success: false, error: 'Saknar användar-id.' }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  try {
    await ensureDatabase(env.DB);
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Användaren hittades inte.' }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    return new Response(JSON.stringify({ success: true, user: buildUserPayload(user, env) }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[profile] GET error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.json();
    const userId = String(payload?.userId || '').trim();
    const name = String(payload?.name || '').trim();
    const email = normalizeEmail(payload?.email);
    const currentPassword = String(payload?.currentPassword || '');
    const newPassword = String(payload?.newPassword || '');

    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Saknar användar-id.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    await ensureDatabase(env.DB);
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Användaren hittades inte.' }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    if (!currentPassword) {
      return new Response(JSON.stringify({ success: false, error: 'Ange nuvarande lösenord för att spara.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const validPassword = await verifyPassword(currentPassword, user.password_hash, user.password_salt);
    if (!validPassword) {
      return new Response(JSON.stringify({ success: false, error: 'Felaktigt nuvarande lösenord.' }), {
        status: 403,
        headers: jsonHeaders,
      });
    }

    if (newPassword && newPassword.length < 8) {
      return new Response(JSON.stringify({ success: false, error: 'Lösenordet måste vara minst 8 tecken.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const updates = [];
    const values = [];
    const now = Date.now();
    let shouldVerifyEmail = false;

    if (name && name !== user.display_name) {
      updates.push('display_name = ?');
      values.push(name);
    }

    if (email && email !== normalizeEmail(user.email)) {
      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (existing && existing.id !== user.id) {
        return new Response(JSON.stringify({ success: false, error: 'E-postadressen är redan registrerad.' }), {
          status: 409,
          headers: jsonHeaders,
        });
      }

      updates.push('email = ?');
      values.push(email);
      updates.push('email_verified = 0');
      shouldVerifyEmail = true;
      const token = crypto.randomUUID();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      updates.push('verification_token = ?');
      values.push(token);
      updates.push('verification_expires = ?');
      values.push(expiresAt);
    }

    if (newPassword) {
      const { hash, salt } = await hashPassword(newPassword);
      updates.push('password_hash = ?');
      values.push(hash);
      updates.push('password_salt = ?');
      values.push(salt);
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ success: true, user: buildUserPayload(user, env) }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(user.id);

    await env.DB.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    const refreshed = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();

    if (shouldVerifyEmail && refreshed?.verification_token) {
      const baseUrl = env.APP_BASE_URL || new URL(request.url).origin;
      const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(refreshed.verification_token)}`;
      const { subject, text, html } = buildVerificationEmail({ name: refreshed.display_name || '', verifyUrl });
      await sendEmail(env, {
        to: refreshed.email,
        subject,
        text,
        html
      });
    }

    return new Response(JSON.stringify({
      success: true,
      user: buildUserPayload(refreshed, env),
      verificationSent: shouldVerifyEmail
    }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[profile] POST error:', error);
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
      'Access-Control-Allow-Headers': 'Content-Type, x-user-id',
    },
  });
}
