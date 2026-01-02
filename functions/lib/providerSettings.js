import { decryptSecret, encryptSecret } from './crypto.js';
import { ensureDatabase } from './ensureDatabase.js';

export const PROVIDERS = [
  'openai',
  'gemini',
  'anthropic',
  'mistral',
  'groq',
  'openrouter',
  'together',
  'fireworks',
];
export const PURPOSES = ['generation', 'validation', 'illustration', 'migration'];

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-3-5-sonnet-20241022',
  mistral: 'mistral-small-latest',
  groq: 'llama-3.1-8b-instant',
  openrouter: 'openai/gpt-4o-mini',
  together: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  fireworks: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
};
const DEFAULT_MAX_QUESTIONS_PER_REQUEST = 3;

const PROVIDER_LABELS = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  anthropic: 'Claude',
  mistral: 'Mistral',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  together: 'Together AI',
  fireworks: 'Fireworks AI',
};
const BUILTIN_SET = new Set(PROVIDERS);

const defaultPurposeSettings = (provider, isCustom = false) => ({
  generation: true,
  validation: true,
  illustration: isCustom ? false : true,
  migration: !isCustom && provider === 'anthropic',
});

const parsePurposeSettings = (value, provider, isCustom = false) => {
  if (!value) return defaultPurposeSettings(provider, isCustom);
  try {
    const parsed = JSON.parse(value);
    return {
      ...defaultPurposeSettings(provider, isCustom),
      ...parsed,
    };
  } catch (error) {
    return defaultPurposeSettings(provider, isCustom);
  }
};

const buildEmptySettings = () => {
  const purposes = PURPOSES.reduce((acc, purpose) => {
    acc[purpose] = {};
    return acc;
  }, {});

  return { purposes, providers: {} };
};

const getEnvKey = (env, provider) => {
  if (!BUILTIN_SET.has(provider)) return null;
  switch (provider) {
    case 'openai':
      return env.OPENAI_API_KEY || null;
    case 'gemini':
      return env.GEMINI_API_KEY || null;
    case 'anthropic':
      return env.ANTHROPIC_API_KEY || null;
    case 'mistral':
      return env.MISTRAL_API_KEY || null;
    case 'groq':
      return env.GROQ_API_KEY || null;
    case 'openrouter':
      return env.OPENROUTER_API_KEY || null;
    case 'together':
      return env.TOGETHER_API_KEY || null;
    case 'fireworks':
      return env.FIREWORKS_API_KEY || null;
    default:
      return null;
  }
};

const parseHeaders = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.warn('[providerSettings] Kunde inte tolka extra_headers:', error.message);
  }
  return null;
};

const normalizeProviderId = (value) => {
  if (!value) return null;
  return String(value).trim().toLowerCase();
};

const resolveLabel = (providerId, row) => {
  if (row?.display_name && String(row.display_name).trim()) {
    return String(row.display_name).trim();
  }
  return PROVIDER_LABELS[providerId] || providerId;
};

export const ensureProviderSettingsRows = async (db) => {
  const existing = await db.prepare('SELECT provider_id FROM provider_settings').all();
  const existingSet = new Set((existing.results || []).map((row) => row.provider_id));
  const now = Date.now();

  for (const provider of PROVIDERS) {
    if (existingSet.has(provider)) continue;
    const purposeSettings = defaultPurposeSettings(provider);
    await db.prepare(
      `INSERT INTO provider_settings (
        provider_id,
        is_enabled,
        is_available,
        purpose_settings,
        model,
        display_name,
        provider_type,
        max_questions_per_request,
        is_custom,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      provider,
      1,
      1,
      JSON.stringify(purposeSettings),
      DEFAULT_MODELS[provider],
      PROVIDER_LABELS[provider] || provider,
      'builtin',
      DEFAULT_MAX_QUESTIONS_PER_REQUEST,
      0,
      now
    ).run();
  }
};

export const getProviderSettingsSnapshot = async (env, { decryptKeys = false } = {}) => {
  await ensureDatabase(env.DB);
  await ensureProviderSettingsRows(env.DB);

  const { results } = await env.DB.prepare('SELECT * FROM provider_settings').all();
  const settings = buildEmptySettings();
  const providerMap = {};
  const rows = results || [];
  const rowMap = new Map(
    rows
      .map((row) => [normalizeProviderId(row.provider_id), row])
      .filter(([key]) => Boolean(key))
  );
  const providerSet = new Set(PROVIDERS);
  rows.forEach((row) => {
    const providerId = normalizeProviderId(row.provider_id);
    if (providerId) providerSet.add(providerId);
  });

  for (const provider of providerSet) {
    const row = rowMap.get(provider) || null;
    const isCustom = row?.is_custom === 1 || (!BUILTIN_SET.has(provider) && row);
    const purposes = parsePurposeSettings(row?.purpose_settings, provider, isCustom);
    const model = (row?.model || DEFAULT_MODELS[provider] || '').trim();
    const isEnabled = row?.is_enabled === 0 ? false : true;
    const isAvailable = row?.is_available === 0 ? false : true;
    const envKey = getEnvKey(env, provider);
    const hasStoredKey = Boolean(row?.encrypted_api_key);
    const displayName = resolveLabel(provider, row);
    const baseUrl = row?.base_url || null;
    const extraHeaders = parseHeaders(row?.extra_headers);
    const supportsResponseFormat =
      row?.supports_response_format === 0 || row?.supports_response_format === false
        ? false
        : true;
    const maxQuestionsPerRequest =
      row?.max_questions_per_request !== undefined && row?.max_questions_per_request !== null
        ? Number(row.max_questions_per_request)
        : DEFAULT_MAX_QUESTIONS_PER_REQUEST;
    const providerType = row?.provider_type || (isCustom ? 'openai_compat' : 'builtin');

    let decryptedKey = null;
    if (decryptKeys && row?.encrypted_api_key) {
      try {
        decryptedKey = await decryptSecret(env, row.encrypted_api_key);
      } catch (error) {
        console.warn(`[providerSettings] Kunde inte dekryptera ${provider}:`, error.message);
      }
    }

    const apiKey = decryptedKey || envKey || null;
    const keySource = decryptedKey || hasStoredKey ? 'db' : envKey ? 'env' : null;
    const keyHint = row?.api_key_hint || (envKey ? 'env' : null);
    const hasKey = Boolean(apiKey) || hasStoredKey;

    providerMap[provider] = {
      providerId: provider,
      apiKey,
      model,
      isEnabled,
      isAvailable,
      purposes,
      hasKey,
      keySource,
      keyHint,
      displayName,
      baseUrl,
      extraHeaders,
      supportsResponseFormat,
      maxQuestionsPerRequest,
      providerType,
      isCustom,
    };

    PURPOSES.forEach((purpose) => {
      settings.purposes[purpose][provider] = purposes[purpose] === false ? false : true;
    });

    settings.providers[provider] = {
      model,
      hasKey,
      keyHint,
      keySource,
      displayName,
      baseUrl,
      extraHeaders: row?.extra_headers || '',
      supportsResponseFormat,
      maxQuestionsPerRequest,
      providerType,
      isCustom,
      isEnabled,
      isAvailable,
    };
  }

  return { settings, providerMap };
};

export const saveProviderSettings = async (env, payload = {}) => {
  await ensureDatabase(env.DB);
  const purposesPayload = payload.purposes || {};
  const providersPayload = payload.providers || {};
  const customProvidersPayload = Array.isArray(payload.customProviders) ? payload.customProviders : null;
  const now = Date.now();

  const normalizedProvidersPayload = Object.entries(providersPayload).reduce((acc, [key, value]) => {
    const normalizedKey = normalizeProviderId(key);
    if (normalizedKey) {
      acc[normalizedKey] = value || {};
    }
    return acc;
  }, {});

  const normalizedPurposesPayload = PURPOSES.reduce((acc, purpose) => {
    const rawPurpose = purposesPayload?.[purpose] || {};
    const normalizedPurpose = Object.entries(rawPurpose).reduce((inner, [key, value]) => {
      const normalizedKey = normalizeProviderId(key);
      if (normalizedKey) {
        inner[normalizedKey] = value;
      }
      return inner;
    }, {});
    acc[purpose] = normalizedPurpose;
    return acc;
  }, {});

  const providerIds = new Set(PROVIDERS);
  Object.keys(normalizedProvidersPayload).forEach((providerId) => providerIds.add(providerId));

  for (const provider of providerIds) {
    const providerConfig = normalizedProvidersPayload[provider] || {};
    const isCustom = providerConfig.isCustom === true || (!BUILTIN_SET.has(provider) && providerConfig);
    const defaultPurposes = defaultPurposeSettings(provider, isCustom);
    const purposeSettings = PURPOSES.reduce((acc, purpose) => {
      const value = normalizedPurposesPayload?.[purpose]?.[provider];
      acc[purpose] = typeof value === 'boolean' ? value : defaultPurposes[purpose];
      return acc;
    }, {});

    const rawModel = providerConfig.model ? String(providerConfig.model).trim() : '';
    const model = rawModel || DEFAULT_MODELS[provider] || '';
    const rawApiKey = providerConfig.apiKey ? String(providerConfig.apiKey).trim() : '';
    const shouldUpdateKey = rawApiKey.length > 0;
    const displayName = providerConfig.displayName
      ? String(providerConfig.displayName).trim()
      : (PROVIDER_LABELS[provider] || provider);
    const baseUrl = providerConfig.baseUrl ? String(providerConfig.baseUrl).trim() : '';
    const extraHeaders =
      providerConfig.extraHeaders && typeof providerConfig.extraHeaders === 'object'
        ? JSON.stringify(providerConfig.extraHeaders)
        : providerConfig.extraHeaders
          ? String(providerConfig.extraHeaders)
          : '';
    const supportsResponseFormat =
      typeof providerConfig.supportsResponseFormat === 'boolean'
        ? providerConfig.supportsResponseFormat
        : true;
    const maxQuestionsPerRequest =
      providerConfig.maxQuestionsPerRequest !== undefined && providerConfig.maxQuestionsPerRequest !== null
        ? Number(providerConfig.maxQuestionsPerRequest)
        : null;
    const providerType = providerConfig.providerType
      ? String(providerConfig.providerType).trim()
      : (isCustom ? 'openai_compat' : 'builtin');

    const isEnabled = Object.values(purposeSettings).some(Boolean) ? 1 : 0;

    if (isCustom && !baseUrl) {
      throw new Error(`Custom provider ${provider} saknar baseUrl`);
    }

    await env.DB.prepare(
      `INSERT INTO provider_settings (
        provider_id,
        is_enabled,
        purpose_settings,
        model,
        display_name,
        base_url,
        extra_headers,
        supports_response_format,
        max_questions_per_request,
        provider_type,
        is_custom,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        is_enabled = excluded.is_enabled,
        purpose_settings = excluded.purpose_settings,
        model = excluded.model,
        display_name = excluded.display_name,
        base_url = excluded.base_url,
        extra_headers = excluded.extra_headers,
        supports_response_format = excluded.supports_response_format,
        max_questions_per_request = excluded.max_questions_per_request,
        provider_type = excluded.provider_type,
        is_custom = excluded.is_custom,
        updated_at = excluded.updated_at`
    ).bind(
      provider,
      isEnabled,
      JSON.stringify(purposeSettings),
      model,
      displayName,
      baseUrl || null,
      extraHeaders || null,
      supportsResponseFormat ? 1 : 0,
      maxQuestionsPerRequest,
      providerType,
      isCustom ? 1 : 0,
      now
    ).run();

    if (shouldUpdateKey) {
      const encrypted = await encryptSecret(env, rawApiKey);
      const hint = rawApiKey.length > 4 ? rawApiKey.slice(-4) : rawApiKey;
      await env.DB.prepare(
        `UPDATE provider_settings
         SET encrypted_api_key = ?, api_key_hint = ?, updated_at = ?
         WHERE provider_id = ?`
      ).bind(encrypted, hint, now, provider).run();
    }
  }

  if (customProvidersPayload) {
    const normalizedCustomIds = new Set(
      customProvidersPayload
        .map((value) => normalizeProviderId(value))
        .filter(Boolean)
    );
    const existingCustom = await env.DB.prepare(
      'SELECT provider_id FROM provider_settings WHERE is_custom = 1'
    ).all();
    const toDelete = (existingCustom.results || [])
      .map((row) => normalizeProviderId(row.provider_id))
      .filter((providerId) => providerId && !normalizedCustomIds.has(providerId));
    for (const providerId of toDelete) {
      await env.DB.prepare('DELETE FROM provider_settings WHERE provider_id = ?').bind(providerId).run();
    }
  }
};
