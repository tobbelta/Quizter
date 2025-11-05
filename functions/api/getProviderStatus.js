/**
 * Cloudflare Pages Function: Get Provider Status
 * Checks which AI providers are configured and working
 */

import { AIProviderFactory } from '../lib/ai-providers/index.js';

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const factory = new AIProviderFactory(env);
    const availableProviders = factory.getAvailableProviders();
    
    console.log('[getProviderStatus] Checking providers:', availableProviders);

    // Test each provider with a minimal request
    const providerStatus = await Promise.all(
      availableProviders.map(async (providerName) => {
        try {
          const provider = factory.getProvider(providerName);
          
          // Try a minimal generation to check if provider works
          // This will fail fast if there are credit/auth issues
          await provider.generateQuestions({
            amount: 1,
            category: 'Test',
            ageGroup: 'vuxen',
            difficulty: 'easy',
            targetAudience: 'vuxna',
            language: 'sv'
          });

          return {
            name: providerName,
            available: true,
            status: 'active',
            model: provider.model,
            info: provider.getInfo()
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
