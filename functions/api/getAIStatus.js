/**
 * Cloudflare Pages Function - Get AI Provider Status
 * Checks which AI providers are configured with API keys
 */

import { getProviderSettingsSnapshot } from '../lib/providerSettings.js';

export async function onRequestGet(context) {
  const { env } = context;

  const { providerMap } = await getProviderSettingsSnapshot(env, { decryptKeys: true });
  
  const providers = Object.entries(providerMap).reduce((acc, [name, provider]) => {
    const hasUsableKey = Boolean(provider.apiKey);
    acc[name] = {
      available: hasUsableKey,
      configured: hasUsableKey,
      message: hasUsableKey ? 'Konfigurerad' : 'Inte konfigurerad',
      activeModel: provider.model,
      label: provider.displayName || name,
      models: [],
    };
    return acc;
  }, {});

  const availableProviders = Object.entries(providers)
    .filter(([, info]) => info.available)
    .map(([name]) => name);
  
  return new Response(JSON.stringify({ 
    providers,
    available: availableProviders.length > 0,
    primaryProvider: availableProviders[0] || null
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
