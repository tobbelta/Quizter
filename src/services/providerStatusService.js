/**
 * Provider Status Service
 * Fetches and caches AI provider availability status
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

class ProviderStatusService {
  constructor() {
    this.cache = null;
    this.cacheTimestamp = null;
    this.cacheDuration = 2 * 60 * 1000; // 2 minutes cache
  }

  /**
   * Fetch provider status from API
   */
  async fetchProviderStatus(forceRefresh = false) {
    // Return cached data if fresh
    if (!forceRefresh && this.cache && this.cacheTimestamp) {
      const cacheAge = Date.now() - this.cacheTimestamp;
      if (cacheAge < this.cacheDuration) {
        console.log('[ProviderStatusService] Returning cached data');
        return this.cache;
      }
    }

    try {
      console.log('[ProviderStatusService] Fetching provider status...');
      
      const response = await fetch(`${API_BASE_URL}/api/getProviderStatus`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch provider status: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get provider status');
      }

      // Update cache
      this.cache = data;
      this.cacheTimestamp = Date.now();

      console.log(`[ProviderStatusService] Status: ${data.summary.active}/${data.summary.total} active`);
      
      return data;

    } catch (error) {
      console.error('[ProviderStatusService] Error:', error);
      throw error;
    }
  }

  /**
   * Get active providers (with tokens/credits)
   */
  async getActiveProviders(forceRefresh = false) {
    const status = await this.fetchProviderStatus(forceRefresh);
    return status.providers.filter(p => p.available);
  }

  /**
   * Get inactive providers (no tokens, auth errors, etc)
   */
  async getInactiveProviders(forceRefresh = false) {
    const status = await this.fetchProviderStatus(forceRefresh);
    return status.providers.filter(p => !p.available);
  }

  /**
   * Check if a specific provider is active
   */
  async isProviderActive(providerName, forceRefresh = false) {
    const status = await this.fetchProviderStatus(forceRefresh);
    const provider = status.providers.find(p => p.name === providerName);
    return provider ? provider.available : false;
  }

  /**
   * Get status summary
   */
  async getSummary(forceRefresh = false) {
    const status = await this.fetchProviderStatus(forceRefresh);
    return status.summary;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache = null;
    this.cacheTimestamp = null;
  }
}

export const providerStatusService = new ProviderStatusService();
