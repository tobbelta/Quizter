/**
 * Cloudflare Pages Function: Get provider settings
 * Returns model + key presence + purpose toggles for providers.
 */
import { getProviderSettingsSnapshot } from '../lib/providerSettings.js';

const isSuperUserRequest = (request, env) => {
  const userEmail = request.headers.get('x-user-email');
  const superuserEmail = env.SUPERUSER_EMAIL || 'admin@admin.se';
  if (!userEmail) return false;
  return userEmail.toLowerCase() === superuserEmail.toLowerCase();
};

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!isSuperUserRequest(request, env)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const { settings } = await getProviderSettingsSnapshot(env, { decryptKeys: false });

    return new Response(
      JSON.stringify({
        success: true,
        settings,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }
    );
  } catch (error) {
    console.error('[getProviderSettings] Error:', error);
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
    },
  });
}
