/**
 * Cloudflare Pages Function: Get Provider Status
 * Checks which AI providers are configured and working
 */

import { AIProviderFactory } from '../lib/ai-providers/index.js';
import { getProviderSettingsSnapshot } from '../lib/providerSettings.js';

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const { providerMap } = await getProviderSettingsSnapshot(env, { decryptKeys: true });
    const factory = new AIProviderFactory(env, providerMap);
    const availableProviders = Object.keys(providerMap || {}).filter((name) => {
      const config = factory.getProviderConfig(name);
      if (!config.apiKey) return false;
      if (!config.isEnabled) return false;
      return true;
    });
    
    console.log('[getProviderStatus] Checking providers:', availableProviders);

    // Test each provider with a minimal API call to check credits
    const providerStatus = await Promise.all(
      availableProviders.map(async (providerName) => {
        try {
          const provider = factory.getProvider(providerName);
          const info = provider.getInfo();
          const displayName = info?.label || info?.name || providerName;
          
          // Check if provider has credits/tokens available
          console.log(`[getProviderStatus] Checking credits for ${providerName}...`);
          const creditCheck = await provider.checkCredits();
          
          if (!creditCheck.available) {
            console.warn(`[getProviderStatus] ${providerName} has no credits:`, creditCheck.message);
            
            let status = 'error';
            if (creditCheck.error === 'insufficient_credits') {
              status = 'no_credits';
            } else if (creditCheck.error === 'rate_limit') {
              status = 'rate_limited';
            } else if (creditCheck.error === 'api_error') {
              status = 'auth_error';
            }
            
            return {
              name: providerName,
              label: displayName,
              available: false,
              status,
              errorType: creditCheck.error,
              model: provider.model,
              error: creditCheck.message
            };
          }

          return {
            name: providerName,
            label: displayName,
            available: true,
            status: 'active',
            model: provider.model,
            info
          };
        } catch (error) {
          console.warn(`[getProviderStatus] ${providerName} failed:`, error.message);
          
          // Parse error to determine status
          let status = 'error';
          let errorType = 'unknown';
          
          if (error.message.includes('credit') || error.message.includes('balance')) {
            status = 'no_credits';
            errorType = 'insufficient_credits';
          } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
            status = 'rate_limited';
            errorType = 'rate_limit';
          } else if (error.message.includes('authentication') || error.message.includes('API key')) {
            status = 'auth_error';
            errorType = 'authentication';
          }

          return {
            name: providerName,
            label: providerName,
            available: false,
            status,
            errorType,
            error: error.message
          };
        }
      })
    );

    const activeProviders = providerStatus.filter(p => p.available);
    const inactiveProviders = providerStatus.filter(p => !p.available);

    console.log(`[getProviderStatus] Active: ${activeProviders.length}, Inactive: ${inactiveProviders.length}`);

    try {
      const now = Date.now();
      await Promise.all(
        providerStatus.map((provider) =>
          env.DB.prepare(
            'UPDATE provider_settings SET is_available = ?, updated_at = ? WHERE provider_id = ?'
          ).bind(provider.available ? 1 : 0, now, provider.name).run()
        )
      );
    } catch (error) {
      console.warn('[getProviderStatus] Failed to update availability:', error.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        providers: providerStatus,
        summary: {
          total: providerStatus.length,
          active: activeProviders.length,
          inactive: inactiveProviders.length
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );

  } catch (error) {
    console.error('[getProviderStatus] Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        providers: []
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
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
