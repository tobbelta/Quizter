/**
 * Update Provider Settings Handler
 * Updates AI provider configuration settings
 */
const logger = require("firebase-functions/logger");
const {initializeFirebase} = require("../../config/firebase");
const {createHttpsHandler, ensurePost} = require("../../utils/middleware");
const {corsMiddleware} = require("../../config/cors");

const admin = initializeFirebase();

const updateProviderSettings = createHttpsHandler(async (req, res) => {
  return corsMiddleware(req, res, async () => {
    if (!ensurePost(req, res)) {
      return;
    }

    try {
      // Verify Firebase ID token
      const idToken = req.headers.authorization?.split("Bearer ")[1];
      if (!idToken) {
        return res.status(401).json({error: "Unauthorized: No token provided"});
      }

      const decodedToken = await admin.auth().verifyIdToken(idToken);

      const {settings} = req.body;

      if (!settings || typeof settings !== "object") {
        return res.status(400).json({error: "Invalid settings object"});
      }

      // Validate structure
      const validPurposes = ["generation", "validation", "migration"];
      const validProviders = ["anthropic", "openai", "gemini"];

      for (const purpose of validPurposes) {
        if (!settings[purpose]) {
          return res.status(400).json({
            error: `Missing settings for ${purpose}`,
          });
        }
        for (const provider of validProviders) {
          if (typeof settings[purpose][provider] !== "boolean") {
            return res.status(400).json({
              error: `Invalid value for ${purpose}.${provider}`,
            });
          }
        }
      }

      const db = admin.firestore();
      await db
          .collection("aiProviderSettings")
          .doc("config")
          .set({
            ...settings,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: decodedToken.uid,
          });

      logger.info("Provider settings updated", {userId: decodedToken.uid});

      res.status(200).json({
        success: true,
        message: "Provider settings updated successfully",
      });
    } catch (error) {
      logger.error("Error updating provider settings", {
        error: error.message,
        stack: error.stack,
      });
      if (
        error.code === "auth/id-token-expired" ||
        error.code === "auth/argument-error"
      ) {
        return res.status(401).json({error: "Unauthorized: Invalid token"});
      }
      res.status(500).json({
        error: "Failed to update provider settings",
        message: error.message,
      });
    }
  });
});

module.exports = updateProviderSettings;
