/**
 * Email settings API (superuser)
 */
import { getEmailSettingsSnapshot, saveEmailSettings, EMAIL_PROVIDER_CATALOG } from '../lib/emailSettings.js';
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
    const snapshot = await getEmailSettingsSnapshot(env, { includeSecrets: false });

    return new Response(
      JSON.stringify({
        success: true,
        settings: snapshot.adminSettings,
        catalog: EMAIL_PROVIDER_CATALOG,
      }),
      {
        status: 200,
        headers: jsonHeaders,
      }
    );
  } catch (error) {
    console.error('[emailSettings] Error:', error);
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

    const adminSettings = await saveEmailSettings(env, settings);
    const actorEmail = request.headers.get('x-user-email');
    const providers = Array.isArray(adminSettings.providers) ? adminSettings.providers : [];
    try {
      await logAuditEvent(env.DB, {
        actorEmail,
        action: 'update',
        targetType: 'email-settings',
        details: {
          activeProviderId: adminSettings.activeProviderId || null,
          fromEmail: adminSettings.fromEmail || null,
          fromName: adminSettings.fromName || null,
          retentionDays: adminSettings.retentionDays || null,
          enabledProviders: providers.filter((provider) => provider.isEnabled).map((provider) => provider.id)
        }
      });
    } catch (error) {
      console.warn('[emailSettings] Audit log failed:', error.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        settings: adminSettings,
        catalog: EMAIL_PROVIDER_CATALOG,
      }),
      {
        status: 200,
        headers: jsonHeaders,
      }
    );
  } catch (error) {
    console.error('[emailSettings] Error:', error);
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
