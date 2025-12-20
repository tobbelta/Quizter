/**
 * Cloudflare Pages Function - Get Available AI Providers
 * Returns information about configured AI providers
 */

import { AIProviderFactory } from '../lib/ai-providers/index.js';
import { getProviderSettingsSnapshot } from '../lib/providerSettings.js';

export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    const { providerMap } = await getProviderSettingsSnapshot(env, { decryptKeys: true });
    const factory = new AIProviderFactory(env, providerMap);
    const providersInfo = factory.getProvidersInfo();
    const availableProviders = factory.getAvailableProviders();
    
    return new Response(JSON.stringify({ 
      success: true,
      providers: providersInfo,
      availableProviders,
      supportsRandom: availableProviders.length > 0
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('[getAIProviders] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle CORS preflight
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
