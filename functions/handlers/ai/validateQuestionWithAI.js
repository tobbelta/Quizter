/**
 * Validate Question With AI Handler
 * Queues a task to validate a question using AI
 */
const logger = require("firebase-functions/logger");
const {initializeFirebase} = require("../../config/firebase");
const {createHttpsHandler, ensurePost} = require("../../utils/middleware");
const {corsMiddleware} = require("../../config/cors");
const {enqueueTask} = require("../../utils/cloudTasks");

const admin = initializeFirebase();

const validateQuestionWithAI = createHttpsHandler(async (req, res) => {
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
      const userId = decodedToken.uid;

      const {question, options, correctOption, explanation} = req.body;

      if (
        !question || !options ||
        correctOption === undefined || !explanation
      ) {
        return res.status(400).json({
          error: "Missing required fields: question, options, " +
            "correctOption, explanation",
        });
      }
      if (!Array.isArray(options) || options.length !== 4) {
        return res.status(400).json({
          error: "Options must be an array of 4 strings",
        });
      }

      const taskId = await enqueueTask(
          "validation",
          {question, options, correctOption, explanation},
          userId,
      );

      res.status(202).json({
        success: true,
        message: "Question validation has been queued.",
        taskId: taskId,
      });
    } catch (error) {
      logger.error("Error queueing AI question validation", {
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
        error: "Failed to queue question validation task.",
        message: error.message,
      });
    }
  });
});

module.exports = validateQuestionWithAI;
