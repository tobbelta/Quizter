/**
 * Cloudflare Pages Function - Get AI Provider Status
 * Checks which AI providers are configured with API keys
 */

export async function onRequestGet(context) {
  const { env } = context;
  
  // Debug logging
  console.log('Environment variables check:');
  console.log('OPENAI_API_KEY:', env.OPENAI_API_KEY ? 'SET' : 'NOT SET');
  console.log('GEMINI_API_KEY:', env.GEMINI_API_KEY ? 'SET' : 'NOT SET');
  console.log('ANTHROPIC_API_KEY:', env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET');
  console.log('MISTRAL_API_KEY:', env.MISTRAL_API_KEY ? 'SET' : 'NOT SET');
  
  const providers = {
    openai: {
      available: Boolean(env.OPENAI_API_KEY),
      message: env.OPENAI_API_KEY ? 'Konfigurerad' : 'Inte konfigurerad',
      models: ['gpt-4o-mini', 'gpt-4o']
    },
    gemini: {
      available: Boolean(env.GEMINI_API_KEY),
      message: env.GEMINI_API_KEY ? 'Konfigurerad' : 'Inte konfigurerad',
      models: ['gemini-1.5-flash', 'gemini-1.5-pro']
    },
    anthropic: {
      available: Boolean(env.ANTHROPIC_API_KEY),
      message: env.ANTHROPIC_API_KEY ? 'Konfigurerad' : 'Inte konfigurerad',
      models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
    },
    mistral: {
      available: Boolean(env.MISTRAL_API_KEY),
      message: env.MISTRAL_API_KEY ? 'Konfigurerad' : 'Inte konfigurerad',
      models: ['mistral-small-latest', 'mistral-large-latest']
    }
  };
  
  return new Response(JSON.stringify({ providers }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
