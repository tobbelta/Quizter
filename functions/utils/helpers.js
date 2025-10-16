/**
 * General helper utilities
 */
const logger = require("firebase-functions/logger");

/**
 * Shuffle an array using Fisher-Yates algorithm
 * @param {Array} items - Array to shuffle
 * @return {Array} Shuffled array
 */
function shuffleArray(items) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Run categorization with multiple providers (fallback chain)
 * @param {object} questionPayload - Question data to categorize
 * @param {Array} providers - Array of provider objects
 * @param {string} docId - Document ID for logging
 * @return {Promise<object|null>} Result and provider, or null
 */
async function runCategorizationWithProviders(
    questionPayload,
    providers,
    docId,
) {
  const order = shuffleArray(
      providers.filter((provider) => typeof provider.categorize === "function"),
  );

  for (const provider of order) {
    try {
      const result = await provider.categorize(questionPayload);
      return {result, provider};
    } catch (error) {
      logger.warn(`Categorization failed for provider ${provider.name}`, {
        questionId: docId,
        error: error.message,
      });
    }
  }

  return null;
}

/**
 * Run emoji generation with multiple providers (fallback chain)
 * @param {object} questionPayload - Question data for emoji generation
 * @param {Array} providers - Array of provider objects
 * @param {string} docId - Document ID for logging
 * @param {object} preferredProvider - Preferred provider to try first
 * @return {Promise<object|null>} Emoji and provider, or null
 */
async function runEmojiGenerationWithProviders(
    questionPayload,
    providers,
    docId,
    preferredProvider,
) {
  const availableProviders = providers.filter(
      (provider) => typeof provider.generateEmoji === "function",
  );
  if (availableProviders.length === 0) {
    return null;
  }

  const remaining = preferredProvider ?
    availableProviders.filter(
        (provider) => provider.name !== preferredProvider.name,
    ) :
    availableProviders;

  const order = preferredProvider ?
    [preferredProvider, ...shuffleArray(remaining)] :
    shuffleArray(availableProviders);

  for (const provider of order) {
    try {
      const emoji = await provider.generateEmoji(questionPayload);
      return {emoji, provider};
    } catch (error) {
      logger.warn(`Emoji generation failed for provider ${provider.name}`, {
        questionId: docId,
        error: error.message,
      });
    }
  }

  return null;
}

module.exports = {
  shuffleArray,
  runCategorizationWithProviders,
  runEmojiGenerationWithProviders,
};
