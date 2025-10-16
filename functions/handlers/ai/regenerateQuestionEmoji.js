/**
 * Regenerate Question Emoji Handler
 * Regenerates illustration/emoji for a single question
 */
const logger = require("firebase-functions/logger");
const {initializeFirebase} = require("../../config/firebase");
const {createHttpsHandler, ensurePost} = require("../../utils/middleware");
const {corsMiddleware} = require("../../config/cors");
const {getProvidersForPurpose} = require("../../utils/providers");
const {runEmojiGenerationWithProviders} = require("../../utils/helpers");

const admin = initializeFirebase();

const regenerateQuestionEmoji = createHttpsHandler(async (req, res) => {
  return corsMiddleware(req, res, async () => {
    if (!ensurePost(req, res)) {
      return;
    }

    try {
      const idToken = req.headers.authorization?.split("Bearer ")[1];
      if (!idToken) {
        return res.status(401).json({error: "Unauthorized: No token provided"});
      }

      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const {questionId, provider} = req.body || {};

      if (!questionId) {
        return res.status(400).json({error: "questionId is required"});
      }

      const db = admin.firestore();
      const questionRef = db.collection("questions").doc(questionId);
      const questionSnap = await questionRef.get();

      if (!questionSnap.exists) {
        return res.status(404).json({error: "Question not found"});
      }

      const questionData = questionSnap.data();

      const toArray = (value) => {
        if (Array.isArray(value)) {
          return value;
        }
        if (value && typeof value === "object") {
          return Object.values(value);
        }
        if (typeof value === "string" && value.trim().length > 0) {
          return [value];
        }
        return [];
      };

      const questionTextRaw =
        questionData.languages?.sv?.text ??
        questionData.question?.sv ??
        questionData.question ??
        questionData.text ??
        questionData.languages?.en?.text ??
        "";

      const questionText =
        typeof questionTextRaw === "string" &&
        questionTextRaw.trim().length > 0 ?
          questionTextRaw :
          "Okänd fråga från tidigare import";

      const rawOptions =
        questionData.languages?.sv?.options ??
        questionData.options?.sv ??
        questionData.options ??
        questionData.languages?.en?.options ??
        [];

      const normalizedOptions = toArray(rawOptions)
          .map((option) =>
            typeof option === "string" ? option : String(option ?? ""),
          )
          .filter((option) => option.trim().length > 0);

      const explanationText =
        questionData.languages?.sv?.explanation ??
        questionData.explanation?.sv ??
        questionData.explanation ??
        questionData.languages?.en?.explanation ??
        "";

      const questionPayload = {
        question: questionText,
        options: normalizedOptions,
        explanation: explanationText,
      };

      const providers = await getProvidersForPurpose("illustration");
      if (providers.length === 0) {
        return res.status(500).json({
          error: "No illustration providers are enabled and configured",
        });
      }

      let preferredProvider = null;
      if (provider) {
        preferredProvider = providers.find((p) => p.name === provider);
      }

      const emojiOutcome = await runEmojiGenerationWithProviders(
          questionPayload,
          providers,
          questionId,
          preferredProvider,
      );

      if (!emojiOutcome) {
        return res.status(500).json({
          error: "Failed to generate illustration with available providers",
        });
      }

      const updateData = {
        illustration: emojiOutcome.emoji,
        illustrationProvider: emojiOutcome.provider.name,
        illustrationGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        migrationSvgProvider: emojiOutcome.provider.name,
        migrationSvgUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await questionRef.update(updateData);

      logger.info("Regenerated illustration for question", {
        questionId,
        provider: emojiOutcome.provider.name,
        requestedProvider: provider || "auto",
        userId: decodedToken.uid,
      });

      res.status(200).json({
        success: true,
        questionId,
        provider: emojiOutcome.provider.name,
        emoji: emojiOutcome.emoji,
      });
    } catch (error) {
      logger.error("Error regenerating illustration", {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        error: "Failed to regenerate illustration",
        message: error.message,
      });
    }
  });
});

module.exports = regenerateQuestionEmoji;
