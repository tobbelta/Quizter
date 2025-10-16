/**
 * AI Provider management utilities
 */
const logger = require("firebase-functions/logger");
const {initializeFirebase} = require("../config/firebase");
const {
  anthropicApiKey,
  openaiApiKey,
  geminiApiKey,
} = require("../config/runtime");
const {
  categorizeQuestion: categorizeWithAnthropic,
} = require("../services/aiQuestionCategorizer");
const {
  generateEmoji: generateEmojiWithAnthropic,
} = require("../services/aiEmojiGenerator.js");
const {
  categorizeQuestion: categorizeWithOpenAI,
} = require("../services/openaiQuestionCategorizer");
const {
  generateEmoji: generateEmojiWithOpenAI,
} = require("../services/openaiEmojiGenerator.js");
const {
  categorizeQuestion: categorizeWithGemini,
} = require("../services/geminiQuestionCategorizer");
const {
  generateEmoji: generateEmojiWithGemini,
} = require("../services/geminiEmojiGenerator.js");

const admin = initializeFirebase();

// Provider status cache
const PROVIDER_STATUS_CACHE_MS = 60 * 1000;
let providerStatusCache = {timestamp: 0, value: null};
let providerStatusPromise = null;

/**
 * Evaluate the status of all AI providers
 * @return {Promise<object>} Provider status information
 */
async function evaluateProviderStatus() {
  const providers = {
    anthropic: {configured: false, available: false},
    openai: {configured: false, available: false},
    gemini: {configured: false, available: false},
  };

  const anthropicKey = anthropicApiKey.value();
  if (anthropicKey) {
    providers.anthropic.configured = true;
    try {
      const Anthropic = require("@anthropic-ai/sdk");
      const anthropic = new Anthropic({apiKey: anthropicKey});

      await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 10,
        messages: [{role: "user", content: "Hi"}],
      });

      providers.anthropic.available = true;
      providers.anthropic.model = "claude-3-5-haiku-20241022";
    } catch (error) {
      logger.warn("Anthropic unavailable", {error: error.message});
      providers.anthropic.error = error.message;
      if (error.status) {
        providers.anthropic.errorStatus = error.status;
      }
    }
  }

  const openaiKey = openaiApiKey.value();
  if (openaiKey) {
    providers.openai.configured = true;
    try {
      const OpenAI = require("openai");
      const openai = new OpenAI({apiKey: openaiKey});

      await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{role: "user", content: "Hi"}],
        max_tokens: 10,
      });

      providers.openai.available = true;
      providers.openai.model = "gpt-4o-mini";
    } catch (error) {
      logger.warn("OpenAI unavailable", {error: error.message});
      providers.openai.error = error.message;
    }
  }

  const geminiKey = geminiApiKey.value();
  if (geminiKey) {
    providers.gemini.configured = true;
    try {
      const listResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${
            geminiKey}`,
      );

      if (listResponse.ok) {
        const modelData = await listResponse.json();
        const availableModels = modelData.models || [];

        const compatibleModel = availableModels.find((model) =>
          model.supportedGenerationMethods?.includes("generateContent"),
        );

        if (compatibleModel) {
          providers.gemini.available = true;
          providers.gemini.model = compatibleModel.name.replace(
              "models/",
              "",
          );
          providers.gemini.availableModels = availableModels.map(
              (model) => model.name,
          );
        } else {
          throw new Error("No compatible Gemini models found");
        }
      } else {
        const errorText = await listResponse.text();
        throw new Error(`Failed to list models: ${errorText}`);
      }
    } catch (error) {
      logger.warn("Gemini unavailable", {error: error.message});
      providers.gemini.error = error.message;
    }
  }

  let primaryProvider = null;
  let message = "Ingen AI-tjänst konfigurerad";

  if (providers.anthropic.available) {
    primaryProvider = "anthropic";
    message = "AI-generering tillgänglig (Anthropic Claude)";
  } else if (providers.openai.available) {
    primaryProvider = "openai";
    message = "AI-generering tillgänglig (OpenAI fallback)";
  } else if (providers.gemini.available) {
    primaryProvider = "gemini";
    message = "AI-generering tillgänglig (Gemini fallback)";
  } else if (
    providers.anthropic.configured ||
    providers.openai.configured ||
    providers.gemini.configured
  ) {
    message = "Alla AI-tjänster ej tillgängliga - kontrollera API-nycklar";
  }

  return {providers, primaryProvider, message};
}

/**
 * Get the current provider status (with caching)
 * @param {object} options - Options object
 * @param {boolean} options.force - Force refresh of cache
 * @return {Promise<object>} Provider status
 */
async function getProviderStatus({force = false} = {}) {
  const now = Date.now();

  if (
    !force &&
    providerStatusCache.value &&
    (now - providerStatusCache.timestamp) < PROVIDER_STATUS_CACHE_MS
  ) {
    return providerStatusCache.value;
  }

  if (providerStatusPromise) {
    return providerStatusPromise;
  }

  providerStatusPromise = evaluateProviderStatus()
      .then((status) => {
        providerStatusCache = {timestamp: Date.now(), value: status};
        return status;
      })
      .catch((error) => {
        providerStatusCache = {timestamp: 0, value: null};
        throw error;
      });

  try {
    return await providerStatusPromise;
  } finally {
    providerStatusPromise = null;
  }
}

/**
 * Get provider settings from Firestore
 * @return {Promise<object>} Provider settings
 */
async function getProviderSettings() {
  try {
    const db = admin.firestore();
    const settingsDoc = await db
        .collection("aiProviderSettings")
        .doc("config")
        .get();

    const defaultSettings = {
      generation: {anthropic: true, openai: true, gemini: true},
      validation: {anthropic: true, openai: true, gemini: true},
      migration: {anthropic: true, openai: false, gemini: false},
      illustration: {anthropic: true, openai: true, gemini: true},
    };

    return settingsDoc.exists ? settingsDoc.data() : defaultSettings;
  } catch (error) {
    logger.warn("Failed to load provider settings, using defaults", {
      error: error.message,
    });
    return {
      generation: {anthropic: true, openai: true, gemini: true},
      validation: {anthropic: true, openai: true, gemini: true},
      migration: {anthropic: true, openai: false, gemini: false},
      illustration: {anthropic: true, openai: true, gemini: true},
    };
  }
}

/**
 * Get available providers for a specific purpose
 * @param {string} purpose - Purpose: 'generation', 'validation',
 *                           'migration', 'illustration'
 * @return {Promise<Array>} Array of available providers
 */
async function getProvidersForPurpose(purpose = "generation") {
  const settings = await getProviderSettings();
  const purposeSettings = settings[purpose] || settings.generation || {};
  const providers = [];
  const status = await getProviderStatus();
  const providerStates = (status && status.providers) || {};
  const requireAvailability = purpose === "migration";

  const isProviderActive = (name) => {
    const state = providerStates[name];
    if (!state) {
      return !requireAvailability;
    }
    if (!state.configured) {
      return false;
    }
    if (requireAvailability) {
      return state.available === true;
    }
    return state.available !== false;
  };

  const anthropicKey = anthropicApiKey.value();
  if (
    anthropicKey &&
    purposeSettings.anthropic !== false &&
    isProviderActive("anthropic")
  ) {
    const provider = {
      name: "anthropic",
      key: anthropicKey,
    };
    if (purpose === "generation") {
      provider.generator = require("../services/aiQuestionGenerator")
          .generateQuestions;
    }
    if (purpose === "migration") {
      provider.categorize = (payload) =>
        categorizeWithAnthropic(payload, anthropicKey);
      provider.generateEmoji = (payload) =>
        generateEmojiWithAnthropic(payload, anthropicKey);
    }
    if (purpose === "illustration") {
      provider.generateEmoji = (payload) =>
        generateEmojiWithAnthropic(payload, anthropicKey);
    }
    providers.push(provider);
  }

  const openaiKey = openaiApiKey.value();
  if (
    openaiKey &&
    purposeSettings.openai !== false &&
    isProviderActive("openai")
  ) {
    const provider = {
      name: "openai",
      key: openaiKey,
    };
    if (purpose === "generation") {
      provider.generator = require("../services/openaiQuestionGenerator")
          .generateQuestions;
    }
    if (purpose === "migration") {
      provider.categorize = (payload) =>
        categorizeWithOpenAI(payload, openaiKey);
      provider.generateEmoji = (payload) =>
        generateEmojiWithOpenAI(payload, openaiKey);
    }
    if (purpose === "illustration") {
      provider.generateEmoji = (payload) =>
        generateEmojiWithOpenAI(payload, openaiKey);
    }
    providers.push(provider);
  }

  const geminiKey = geminiApiKey.value();
  if (
    geminiKey &&
    purposeSettings.gemini !== false &&
    isProviderActive("gemini")
  ) {
    const provider = {
      name: "gemini",
      key: geminiKey,
    };
    if (purpose === "generation") {
      provider.generator = require("../services/geminiQuestionGenerator")
          .generateQuestions;
    }
    if (purpose === "migration") {
      provider.categorize = (payload) =>
        categorizeWithGemini(payload, geminiKey);
      provider.generateEmoji = (payload) =>
        generateEmojiWithGemini(payload, geminiKey);
    }
    if (purpose === "illustration") {
      provider.generateEmoji = (payload) =>
        generateEmojiWithGemini(payload, geminiKey);
    }
    providers.push(provider);
  }

  return providers;
}

/**
 * Randomly select an available AI provider
 * @param {string} purpose - Purpose: 'generation', 'validation', 'migration'
 * @return {Promise<object|null>} Selected provider or null
 */
async function selectRandomProvider(purpose = "generation") {
  const providers = await getProvidersForPurpose(purpose);
  if (providers.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * providers.length);
  return providers[randomIndex];
}

module.exports = {
  evaluateProviderStatus,
  getProviderStatus,
  getProviderSettings,
  getProvidersForPurpose,
  selectRandomProvider,
};
