/**
 * Get Provider Settings Handler
 * Retrieves AI provider configuration settings
 */
const logger = require("firebase-functions/logger");
const {initializeFirebase} = require("../../config/firebase");
const {createHttpsHandler} = require("../../utils/middleware");
const {corsMiddleware} = require("../../config/cors");

const admin = initializeFirebase();

const getProviderSettings = createHttpsHandler(async (req, res) => {
  return corsMiddleware(req, res, async () => {
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

      if (!settingsDoc.exists) {
        res.status(200).json({
          settings: defaultSettings,
          message: "Using default settings",
        });
      } else {
        res.status(200).json({
          settings: settingsDoc.data(),
          message: "Settings loaded successfully",
        });
      }
    } catch (error) {
      logger.error("Error getting provider settings", {
        error: error.message,
      });
      res.status(500).json({
        error: "Failed to get provider settings",
        message: error.message,
      });
    }
  });
});

module.exports = getProviderSettings;
