/**
 * Provider Settings API Test
 * Verifies admin-only access and updates for provider model/purpose settings.
 */

// Polyfill fetch for Node.js
if (typeof global.fetch === 'undefined') {
  const { default: fetch } = require('node-fetch');
  global.fetch = fetch;
}

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:8788';
const SUPERUSER_EMAIL = process.env.SUPERUSER_EMAIL || process.env.TEST_SUPERUSER_EMAIL;

class ProviderSettingsTest {
  constructor() {
    this.originalSettings = null;
  }

  async makeRequest(path, options = {}) {
    const url = `${BASE_URL}${path}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const bodyText = await response.text();
    let bodyJson = null;
    if (bodyText) {
      try {
        bodyJson = JSON.parse(bodyText);
      } catch (error) {
        // ignore
      }
    }

    return { response, bodyText, bodyJson };
  }

  async testUnauthorizedAccess() {
    console.log('🔐 Testing unauthorized access...');
    const { response } = await this.makeRequest('/api/getProviderSettings');
    if (response.status !== 403) {
      throw new Error(`Expected 403 for unauthorized access, got ${response.status}`);
    }
    console.log('✅ Unauthorized access blocked');
  }

  async fetchSettings() {
    const { response, bodyJson } = await this.makeRequest('/api/getProviderSettings', {
      headers: { 'x-user-email': SUPERUSER_EMAIL },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch settings: ${response.status}`);
    }

    if (!bodyJson?.success || !bodyJson.settings) {
      throw new Error('Malformed settings response');
    }

    return bodyJson.settings;
  }

  buildProviderPayload(providers, override = {}) {
    return Object.entries(providers).reduce((acc, [key, config]) => {
      acc[key] = {
        model: override[key]?.model || config.model || '',
        apiKey: override[key]?.apiKey || '',
      };
      return acc;
    }, {});
  }

  async updateSettings(payload) {
    const { response, bodyJson } = await this.makeRequest('/api/updateProviderSettings', {
      method: 'POST',
      headers: { 'x-user-email': SUPERUSER_EMAIL },
      body: JSON.stringify({ settings: payload }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update settings: ${response.status}`);
    }

    if (!bodyJson?.success) {
      throw new Error(`Update failed: ${bodyJson?.error || 'Unknown error'}`);
    }
  }

  async testUpdateModelAndPurpose() {
    console.log('🧪 Testing provider model + purpose update...');

    const settings = await this.fetchSettings();
    this.originalSettings = settings;

    if (!settings.providers?.openai) {
      throw new Error('OpenAI provider not found in settings');
    }

    const originalModel = settings.providers.openai.model || 'gpt-4o-mini';
    const testModel = originalModel === 'gpt-4o-mini' ? 'gpt-4o' : 'gpt-4o-mini';

    const purposes = JSON.parse(JSON.stringify(settings.purposes || {}));
    if (!purposes.generation) {
      throw new Error('Missing purpose settings');
    }
    const originalGeneration = Boolean(purposes.generation.openai);
    purposes.generation.openai = !originalGeneration;

    const providersPayload = this.buildProviderPayload(settings.providers, {
      openai: { model: testModel },
    });

    await this.updateSettings({ purposes, providers: providersPayload });

    const updated = await this.fetchSettings();
    const updatedModel = updated.providers.openai.model;
    const updatedGeneration = Boolean(updated.purposes?.generation?.openai);

    if (updatedModel !== testModel) {
      throw new Error(`Expected model ${testModel}, got ${updatedModel}`);
    }
    if (updatedGeneration === originalGeneration) {
      throw new Error('Expected generation purpose toggle to change');
    }

    console.log('✅ Provider settings updated');
  }

  async restoreSettings() {
    if (!this.originalSettings) return;
    console.log('🧹 Restoring original provider settings...');
    const purposes = this.originalSettings.purposes || {};
    const providersPayload = this.buildProviderPayload(this.originalSettings.providers || {});
    await this.updateSettings({ purposes, providers: providersPayload });
    console.log('✅ Provider settings restored');
  }

  async run() {
    if (!SUPERUSER_EMAIL) {
      console.warn('⚠️ SUPERUSER_EMAIL saknas, hoppar över provider-settings test.');
      return true;
    }

    const startTime = Date.now();
    console.log('🚀 Starting Provider Settings Test...\n');

    try {
      await this.testUnauthorizedAccess();
      await this.testUpdateModelAndPurpose();

      const duration = Date.now() - startTime;
      console.log(`\n🎉 PROVIDER SETTINGS TESTS PASSED (${duration}ms)\n`);
      return true;
    } catch (error) {
      console.error('\n❌ TEST FAILED:', error.message);
      return false;
    } finally {
      try {
        await this.restoreSettings();
      } catch (error) {
        console.warn('⚠️ Could not restore settings:', error.message);
      }
    }
  }
}

module.exports = { ProviderSettingsTest };

if (require.main === module) {
  (async () => {
    const test = new ProviderSettingsTest();
    const success = await test.run();
    process.exit(success ? 0 : 1);
  })();
}
