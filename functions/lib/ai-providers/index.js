/**
 * AI Provider Factory
 * Creates and manages AI provider instances
 */

import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { AnthropicProvider } from './anthropic.js';
import { MistralProvider } from './mistral.js';

export class AIProviderFactory {
  constructor(env, providerSettings = {}) {
    this.env = env;
    this.providerSettings = providerSettings;
    this.providers = new Map();
  }

  getProviderConfig(providerName) {
    const name = providerName.toLowerCase();
    const settings = this.providerSettings[name] || {};
    let apiKey = settings.apiKey;

    if (!apiKey) {
      if (name === 'openai') apiKey = this.env.OPENAI_API_KEY;
      if (name === 'gemini') apiKey = this.env.GEMINI_API_KEY;
      if (name === 'anthropic') apiKey = this.env.ANTHROPIC_API_KEY;
      if (name === 'mistral') apiKey = this.env.MISTRAL_API_KEY;
      if (name === 'groq') apiKey = this.env.GROQ_API_KEY;
      if (name === 'openrouter') apiKey = this.env.OPENROUTER_API_KEY;
      if (name === 'together') apiKey = this.env.TOGETHER_API_KEY;
      if (name === 'fireworks') apiKey = this.env.FIREWORKS_API_KEY;
    }

    return {
      apiKey,
      model: settings.model,
      isEnabled: settings.isEnabled !== false,
      isAvailable: settings.isAvailable !== false,
      purposes: settings.purposes || {},
      baseUrl: settings.baseUrl || null,
      extraHeaders: settings.extraHeaders || null,
      supportsResponseFormat: settings.supportsResponseFormat,
      maxQuestionsPerRequest: settings.maxQuestionsPerRequest,
      providerType: settings.providerType,
      isCustom: settings.isCustom,
      label: settings.displayName || settings.label,
    };
  }

  /**
   * Get or create a provider instance
   */
  getProvider(providerName) {
    const name = providerName.toLowerCase();
    
    // Return cached provider if exists
    if (this.providers.has(name)) {
      return this.providers.get(name);
    }
    
    // Create new provider instance
    let provider;
    
    const config = this.getProviderConfig(name);

    if (config.isCustom || config.providerType === 'openai_compat') {
      if (!config.apiKey) {
        throw new Error(`${config.label || providerName} API key not configured`);
      }
      if (!config.baseUrl) {
        throw new Error(`${config.label || providerName} baseUrl not configured`);
      }
      provider = new OpenAIProvider(config.apiKey, config.model, {
        name,
        label: config.label,
        baseUrl: config.baseUrl,
        supportsResponseFormat: config.supportsResponseFormat,
        maxQuestionsPerRequest: config.maxQuestionsPerRequest,
        extraHeaders: config.extraHeaders || {},
      });
      this.providers.set(name, provider);
      return provider;
    }

    switch (name) {
      case 'openai':
        if (!config.apiKey) {
          throw new Error('OpenAI API key not configured');
        }
        provider = new OpenAIProvider(config.apiKey, config.model, {
          name: 'openai',
          baseUrl: 'https://api.openai.com/v1/chat/completions',
          supportsResponseFormat: true,
        });
        break;
        
      case 'gemini':
        if (!config.apiKey) {
          throw new Error('Gemini API key not configured');
        }
        provider = new GeminiProvider(config.apiKey, config.model);
        break;
        
      case 'anthropic':
        if (!config.apiKey) {
          throw new Error('Anthropic API key not configured');
        }
        provider = new AnthropicProvider(config.apiKey, config.model);
        break;
        
      case 'mistral':
        if (!config.apiKey) {
          throw new Error('Mistral API key not configured');
        }
        provider = new MistralProvider(config.apiKey, config.model);
        break;
        
      case 'groq':
        if (!config.apiKey) {
          throw new Error('Groq API key not configured');
        }
        provider = new OpenAIProvider(config.apiKey, config.model, {
          name: 'groq',
          baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
          supportsResponseFormat: true,
        });
        break;
        
      case 'openrouter':
        if (!config.apiKey) {
          throw new Error('OpenRouter API key not configured');
        }
        provider = new OpenAIProvider(config.apiKey, config.model, {
          name: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
          supportsResponseFormat: true,
        });
        break;
        
      case 'together':
        if (!config.apiKey) {
          throw new Error('Together API key not configured');
        }
        provider = new OpenAIProvider(config.apiKey, config.model, {
          name: 'together',
          baseUrl: 'https://api.together.xyz/v1/chat/completions',
          supportsResponseFormat: false,
        });
        break;
        
      case 'fireworks':
        if (!config.apiKey) {
          throw new Error('Fireworks API key not configured');
        }
        provider = new OpenAIProvider(config.apiKey, config.model, {
          name: 'fireworks',
          baseUrl: 'https://api.fireworks.ai/inference/v1/chat/completions',
          supportsResponseFormat: false,
        });
        break;
        
      default:
        throw new Error(`Unknown provider: ${providerName}`);
    }
    
    // Cache the provider
    this.providers.set(name, provider);
    
    return provider;
  }

  /**
   * Get a random provider from available ones
   */
  getRandomProvider(purpose = null) {
    const available = this.getAvailableProviders(purpose);
    
    if (available.length === 0) {
      throw new Error('No AI providers are configured');
    }
    
    const randomIndex = Math.floor(Math.random() * available.length);
    const selectedName = available[randomIndex];
    
    return {
      name: selectedName,
      provider: this.getProvider(selectedName)
    };
  }

  /**
   * Get list of available (configured) providers
   */
  getAvailableProviders(purpose = null) {
    const configured = Object.keys(this.providerSettings || {});
    const fallback = ['openai', 'gemini', 'anthropic', 'mistral', 'groq', 'openrouter', 'together', 'fireworks'];
    const candidates = configured.length > 0 ? configured : fallback;

    return candidates.filter((name) => {
      const config = this.getProviderConfig(name);
      if (!config.apiKey) return false;
      if (!config.isEnabled) return false;
      if (!config.isAvailable) return false;
      if (purpose && config.purposes && config.purposes[purpose] === false) {
        return false;
      }
      return true;
    });
  }

  /**
   * Get validation providers (all except the generation provider)
   * Only returns providers that are available and working
   */
  getValidationProviders(generationProviderName) {
    const available = this.getAvailableProviders('validation');
    const genProvider = generationProviderName.toLowerCase();
    
    // Return all providers except the one that generated the questions
    const validationProviders = available
      .filter(name => name !== genProvider)
      .map(name => {
        try {
          return this.getProvider(name);
        } catch (error) {
          console.warn(`[AIProviderFactory] Provider ${name} not available for validation:`, error.message);
          return null;
        }
      })
      .filter(provider => provider !== null); // Remove failed providers
    
    if (validationProviders.length === 0) {
      console.warn(`[AIProviderFactory] No validation providers available (generation provider: ${genProvider})`);
    }
    
    return validationProviders;
  }

  /**
   * Get info about all available providers
   */
  getProvidersInfo() {
    const available = this.getAvailableProviders();
    
    return available.map(name => {
      try {
        const provider = this.getProvider(name);
        return provider.getInfo();
      } catch (error) {
        return {
          name,
          error: error.message,
          available: false
        };
      }
    });
  }
}

// Export provider classes for direct use if needed
export { OpenAIProvider, GeminiProvider, AnthropicProvider, MistralProvider };
