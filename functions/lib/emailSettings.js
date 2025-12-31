import { decryptSecret, encryptSecret } from './crypto.js';
import { ensureDatabase } from './ensureDatabase.js';

export const EMAIL_PROVIDER_CATALOG = [
  { id: 'resend', label: 'Resend', type: 'resend' },
  { id: 'sendgrid', label: 'SendGrid', type: 'sendgrid' },
  { id: 'mailgun', label: 'Mailgun', type: 'mailgun' },
  { id: 'postmark', label: 'Postmark', type: 'postmark' },
  { id: 'mailersend', label: 'MailerSend', type: 'mailersend' },
  { id: 'custom', label: 'Custom', type: 'custom' }
];

const DEFAULT_PROVIDER_ID = 'resend';
const RETENTION_OPTIONS = [30, 90, 180];

const normalizeProviderId = (value) => {
  if (!value) return null;
  return String(value).trim().toLowerCase();
};

const buildDefaultProviders = () => EMAIL_PROVIDER_CATALOG.map((provider) => ({
  id: provider.id,
  label: provider.label,
  type: provider.type,
  isEnabled: provider.id !== 'custom',
  encryptedSecret: null,
  secretHint: '',
  domain: '',
  baseUrl: '',
  extraHeaders: '',
  endpoint: '',
  method: 'POST',
  payloadTemplate: '',
  isCustom: provider.id === 'custom'
}));

const DEFAULT_SETTINGS = {
  activeProviderId: DEFAULT_PROVIDER_ID,
  fromEmail: '',
  fromName: 'Quizter',
  replyTo: '',
  retentionDays: 90,
  providers: buildDefaultProviders()
};

const mergeProvider = (base, stored) => {
  if (!stored || typeof stored !== 'object') return base;
  return {
    ...base,
    ...stored,
    id: base.id,
    label: stored.label || base.label,
    type: stored.type || base.type,
    isEnabled: stored.isEnabled !== undefined ? Boolean(stored.isEnabled) : base.isEnabled,
    encryptedSecret: stored.encryptedSecret || base.encryptedSecret || null,
    secretHint: stored.secretHint || base.secretHint || '',
    domain: stored.domain || base.domain || '',
    baseUrl: stored.baseUrl || base.baseUrl || '',
    extraHeaders: stored.extraHeaders || base.extraHeaders || '',
    endpoint: stored.endpoint || base.endpoint || '',
    method: stored.method || base.method || 'POST',
    payloadTemplate: stored.payloadTemplate || base.payloadTemplate || '',
    isCustom: base.isCustom || stored.isCustom || false
  };
};

const buildProviders = (storedProviders = []) => {
  const defaults = buildDefaultProviders();
  const storedMap = new Map();

  if (Array.isArray(storedProviders)) {
    storedProviders.forEach((provider) => {
      const id = normalizeProviderId(provider?.id);
      if (!id) return;
      storedMap.set(id, provider);
    });
  }

  return defaults.map((provider) => mergeProvider(provider, storedMap.get(provider.id)));
};

const normalizeSettings = (stored = {}) => {
  const retention = Number(stored.retentionDays);
  return {
    activeProviderId: normalizeProviderId(stored.activeProviderId) || DEFAULT_SETTINGS.activeProviderId,
    fromEmail: stored.fromEmail || DEFAULT_SETTINGS.fromEmail,
    fromName: stored.fromName || DEFAULT_SETTINGS.fromName,
    replyTo: stored.replyTo || DEFAULT_SETTINGS.replyTo,
    retentionDays: RETENTION_OPTIONS.includes(retention) ? retention : DEFAULT_SETTINGS.retentionDays,
    providers: buildProviders(stored.providers || [])
  };
};

const buildAdminSettings = (settings) => {
  const providers = settings.providers.map((provider) => ({
    ...provider,
    hasSecret: Boolean(provider.encryptedSecret),
    encryptedSecret: undefined
  }));

  return {
    ...settings,
    providers
  };
};

const readStoredSettings = async (db) => {
  const row = await db.prepare('SELECT config FROM email_settings WHERE id = ?').bind('default').first();
  if (!row || !row.config) return null;
  try {
    return JSON.parse(row.config);
  } catch (error) {
    console.warn('[emailSettings] Kunde inte tolka lagrad config:', error.message);
    return null;
  }
};

export const getEmailSettingsSnapshot = async (env, { includeSecrets = false } = {}) => {
  await ensureDatabase(env.DB);
  const stored = await readStoredSettings(env.DB);
  const settings = normalizeSettings(stored || {});

  if (includeSecrets) {
    settings.providers = await Promise.all(settings.providers.map(async (provider) => {
      if (!provider.encryptedSecret) {
        return { ...provider, secretKey: null };
      }
      try {
        const secretKey = await decryptSecret(env, provider.encryptedSecret);
        return { ...provider, secretKey };
      } catch (error) {
        console.warn(`[emailSettings] Kunde inte dekryptera ${provider.id}:`, error.message);
        return { ...provider, secretKey: null };
      }
    }));
  }

  return {
    settings,
    adminSettings: buildAdminSettings(settings)
  };
};

export const saveEmailSettings = async (env, payload = {}) => {
  await ensureDatabase(env.DB);
  const normalized = normalizeSettings(payload);
  const providers = await Promise.all(normalized.providers.map(async (provider) => {
    if (provider.clearSecret) {
      return { ...provider, encryptedSecret: null, secretHint: '' };
    }

    if (provider.secretKey) {
      const encryptedSecret = await encryptSecret(env, provider.secretKey);
      return {
        ...provider,
        encryptedSecret,
        secretHint: provider.secretKey.slice(0, 4) + '…'
      };
    }

    return provider;
  }));

  const settingsToStore = {
    ...normalized,
    providers: providers.map((provider) => ({
      ...provider,
      secretKey: undefined,
      clearSecret: undefined
    }))
  };

  const now = Date.now();
  const serialized = JSON.stringify(settingsToStore);
  await env.DB.prepare(
    'INSERT INTO email_settings (id, config, updated_at) VALUES (?, ?, ?)\n      ON CONFLICT(id) DO UPDATE SET config = ?, updated_at = ?'
  ).bind('default', serialized, now, serialized, now).run();

  return buildAdminSettings(settingsToStore);
};
