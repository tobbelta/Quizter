import { ensureDatabase } from './ensureDatabase.js';
import { getEmailSettingsSnapshot } from './emailSettings.js';

const clampRetentionDays = (value) => {
  const numeric = Number(value);
  if ([30, 90, 180].includes(numeric)) return numeric;
  return 90;
};

export const pruneEmailEvents = async (env) => {
  await ensureDatabase(env.DB);
  const { settings } = await getEmailSettingsSnapshot(env, { includeSecrets: false });
  const retentionDays = clampRetentionDays(settings.retentionDays);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  await env.DB.prepare('DELETE FROM email_events WHERE created_at < ?').bind(cutoff).run();
};

export const recordEmailEvent = async (env, event) => {
  await ensureDatabase(env.DB);
  const id = crypto.randomUUID();
  const createdAt = Date.now();

  await env.DB.prepare(
    `INSERT INTO email_events (
      id,
      provider_id,
      provider_type,
      status,
      to_email,
      subject,
      payload,
      response,
      error,
      created_at,
      resend_of
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    event.providerId || null,
    event.providerType || null,
    event.status || 'sent',
    event.to || null,
    event.subject || null,
    event.payload ? JSON.stringify(event.payload) : null,
    event.response || null,
    event.error || null,
    createdAt,
    event.resendOf || null
  ).run();

  await pruneEmailEvents(env);

  return id;
};
