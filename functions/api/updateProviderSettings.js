/**
 * Cloudflare Pages Function: Update provider settings
 * Saves model + encrypted API keys + purpose toggles.
 */
import { getProviderSettingsSnapshot, saveProviderSettings } from '../lib/providerSettings.js';
import { logAuditEvent } from '../lib/auditLogs.js';

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
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const payload = await request.json();
    const settings = payload?.settings || {};

    await saveProviderSettings(env, settings);
    const { settings: nextSettings } = await getProviderSettingsSnapshot(env, { decryptKeys: false });
    const actorEmail = request.headers.get('x-user-email');
    const providers = nextSettings?.providers ? Object.values(nextSettings.providers) : [];
    const purposes = nextSettings?.purposes || {};
    const purposeSummary = Object.keys(purposes).reduce((acc, purpose) => {
      const enabledForPurpose = purposes[purpose] || {};
      acc[purpose] = Object.keys(enabledForPurpose).filter((key) => enabledForPurpose[key]);
      return acc;
    }, {});

    try {
      await logAuditEvent(env.DB, {
        actorEmail,
        action: 'update',
        targetType: 'ai-providers',
        details: {
          providerCount: providers.length,
          enabledProviders: providers.filter((provider) => provider.isEnabled).map((provider) => provider.providerId),
          customProviders: providers.filter((provider) => provider.isCustom).map((provider) => provider.providerId),
          purposeSummary
        }
      });
    } catch (error) {
      console.warn('[updateProviderSettings] Audit log failed:', error.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        settings: nextSettings,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }
    );
  } catch (error) {
    console.error('[updateProviderSettings] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }
    );
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
