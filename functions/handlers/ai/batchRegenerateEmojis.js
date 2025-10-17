/**
 * Batch Regenerate Emojis Handler
 * Queues a task to regenerate emojis for multiple questions
 */
const logger = require("firebase-functions/logger");
const {initializeFirebase} = require("../../config/firebase");
const {createHttpsHandler, ensurePost} = require("../../utils/middleware");
const {corsMiddleware} = require("../../config/cors");
const {enqueueTask} = require("../../utils/cloudTasks");

const admin = initializeFirebase();

const batchRegenerateEmojis = createHttpsHandler(async (req, res) => {
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
      const userId = decodedToken.uid;

      const {questionIds} = req.body;

      if (!Array.isArray(questionIds) || questionIds.length === 0) {
        return res.status(400).json({
          error: "questionIds must be a non-empty array",
        });
      }

      const taskId = await enqueueTask(
          "batchregenerateemojis",
          {questionIds},
          userId,
      );

      res.status(202).json({
        success: true,
        message: `Batch emoji regeneration of ${
          questionIds.length} questions has been queued.`,
        taskId: taskId,
        questionCount: questionIds.length,
      });
    } catch (error) {
      logger.error("Error queueing batch emoji regeneration", {
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
        error: "Failed to queue batch emoji regeneration task.",
        message: error.message,
      });
    }
  });
});

module.exports = batchRegenerateEmojis;
