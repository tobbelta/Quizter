/**
 * Payment config API (public)
 */
import { getPaymentSettingsSnapshot } from '../lib/paymentSettings.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const snapshot = await getPaymentSettingsSnapshot(env, { includeSecrets: false });

    return new Response(
      JSON.stringify({
        success: true,
        config: snapshot.publicConfig,
      }),
      {
        status: 200,
        headers: jsonHeaders,
      }
    );
  } catch (error) {
    console.error('[paymentConfig] Error:', error);
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
