/**
 * Cloudflare Pages Function - Get AI Provider Status
 * Checks which AI providers are configured with API keys
 */

export async function onRequestGet(context) {
  const { env } = context;
  
  const status = {
    openai: {
      configured: Boolean(env.OPENAI_API_KEY),
      name: 'OpenAI',
      models: ['gpt-4o-mini', 'gpt-4o']
    },
    gemini: {
      configured: Boolean(env.GEMINI_API_KEY),
      name: 'Google Gemini',
      models: ['gemini-1.5-flash', 'gemini-1.5-pro']
    },
    anthropic: {
      configured: Boolean(env.ANTHROPIC_API_KEY),
      name: 'Anthropic Claude',
      models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
    },
    mistral: {
      configured: Boolean(env.MISTRAL_API_KEY),
      name: 'Mistral AI',
      models: ['mistral-small-latest', 'mistral-large-latest']
    }
  };
  
  return new Response(JSON.stringify(status), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
