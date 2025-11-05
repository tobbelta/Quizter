/**
 * AI Provider Factory
 * Creates and manages AI provider instances
 */

import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { AnthropicProvider } from './anthropic.js';
import { MistralProvider } from './mistral.js';

export class AIProviderFactory {
  constructor(env) {
    this.env = env;
    this.providers = new Map();
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
    
    switch (name) {
      case 'openai':
        if (!this.env.OPENAI_API_KEY) {
          throw new Error('OpenAI API key not configured');
        }
        provider = new OpenAIProvider(this.env.OPENAI_API_KEY);
        break;
        
      case 'gemini':
        if (!this.env.GEMINI_API_KEY) {
          throw new Error('Gemini API key not configured');
        }
        provider = new GeminiProvider(this.env.GEMINI_API_KEY);
        break;
        
      case 'anthropic':
        if (!this.env.ANTHROPIC_API_KEY) {
          throw new Error('Anthropic API key not configured');
        }
        provider = new AnthropicProvider(this.env.ANTHROPIC_API_KEY);
        break;
        
      case 'mistral':
        if (!this.env.MISTRAL_API_KEY) {
          throw new Error('Mistral API key not configured');
        }
        provider = new MistralProvider(this.env.MISTRAL_API_KEY);
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
  getRandomProvider() {
    const available = this.getAvailableProviders();
    
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
  getAvailableProviders() {
    const available = [];
    
    if (this.env.OPENAI_API_KEY) available.push('openai');
    if (this.env.GEMINI_API_KEY) available.push('gemini');
    if (this.env.ANTHROPIC_API_KEY) available.push('anthropic');
    if (this.env.MISTRAL_API_KEY) available.push('mistral');
    
    return available;
  }

  /**
   * Get validation providers (all except the generation provider)
   */
  getValidationProviders(generationProviderName) {
    const available = this.getAvailableProviders();
    const genProvider = generationProviderName.toLowerCase();
    
    // Return all providers except the one that generated the questions
    return available
      .filter(name => name !== genProvider)
      .map(name => this.getProvider(name));
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
