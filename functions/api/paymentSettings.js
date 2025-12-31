/**
 * Payment settings API (superuser)
 */
import { getPaymentSettingsSnapshot, savePaymentSettings, getPaymentCatalog } from '../lib/paymentSettings.js';
import { logAuditEvent } from '../lib/auditLogs.js';

const isSuperUserRequest = (request, env) => {
  const userEmail = request.headers.get('x-user-email');
  const superuserEmail = env.SUPERUSER_EMAIL || 'admin@admin.se';
  if (!userEmail) return false;
  return userEmail.toLowerCase() === superuserEmail.toLowerCase();
};

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!isSuperUserRequest(request, env)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 403,
      headers: jsonHeaders,
    });
  }

  try {
    const snapshot = await getPaymentSettingsSnapshot(env, { includeSecrets: false });
    const catalog = getPaymentCatalog();

    return new Response(
      JSON.stringify({
        success: true,
        settings: snapshot.adminSettings,
        catalog,
      }),
      {
        status: 200,
        headers: jsonHeaders,
      }
    );
  } catch (error) {
    console.error('[paymentSettings] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
}

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
    const settings = payload?.settings || {};

    await savePaymentSettings(env, settings);
    const snapshot = await getPaymentSettingsSnapshot(env, { includeSecrets: false });
    const catalog = getPaymentCatalog();
    const actorEmail = request.headers.get('x-user-email');
    const adminSettings = snapshot.adminSettings || {};
    const providers = Array.isArray(adminSettings.providers) ? adminSettings.providers : [];
    try {
      await logAuditEvent(env.DB, {
        actorEmail,
        action: 'update',
        targetType: 'payments',
        details: {
          activeProviderId: adminSettings.activeProviderId || null,
          enabledProviders: providers.filter((provider) => provider.isEnabled).map((provider) => provider.id),
          payer: adminSettings.payer,
          currency: adminSettings.currency,
          perRunEnabled: Boolean(adminSettings?.perRun?.enabled),
          subscriptionEnabled: Boolean(adminSettings?.subscription?.enabled),
          donationEnabled: Boolean(adminSettings?.donations?.enabled),
          anonymousPolicy: adminSettings?.anonymous?.policy || null,
          maxAnonymous: adminSettings?.anonymous?.maxPerRun ?? null
        }
      });
    } catch (error) {
      console.warn('[paymentSettings] Audit log failed:', error.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        settings: snapshot.adminSettings,
        catalog,
      }),
      {
        status: 200,
        headers: jsonHeaders,
      }
    );
  } catch (error) {
    console.error('[paymentSettings] Error:', error);
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
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
    },
  });
}
