/**
 * Resend email from log (superuser)
 */
import { ensureDatabase } from '../../lib/ensureDatabase.js';
import { sendEmail } from '../../lib/emailSender.js';

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
    const id = String(payload?.id || '').trim();

    if (!id) {
      return new Response(JSON.stringify({ success: false, error: 'Logg-ID saknas.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    await ensureDatabase(env.DB);

    const log = await env.DB.prepare('SELECT * FROM email_events WHERE id = ?').bind(id).first();
    if (!log) {
      return new Response(JSON.stringify({ success: false, error: 'Kunde inte hitta loggen.' }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    let payloadData = {};
    try {
      payloadData = log.payload ? JSON.parse(log.payload) : {};
    } catch (error) {
      payloadData = {};
    }

    await sendEmail(env, {
      to: payloadData.to || log.to_email,
      subject: payloadData.subject || log.subject,
      html: payloadData.html || '',
      text: payloadData.text || '',
      replyTo: payloadData.replyTo || null,
      fromEmail: payloadData.fromEmail || null,
      fromName: payloadData.fromName || null,
      resendOf: log.id
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[emailLogs/resend] Error:', error);
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
