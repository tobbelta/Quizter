/**
 * Regenerate All Illustrations Handler
 * Queues a task to regenerate all question illustrations
 */
const logger = require("firebase-functions/logger");
const {initializeFirebase} = require("../../config/firebase");
const {createHttpsHandler, ensurePost} = require("../../utils/middleware");
const {corsMiddleware} = require("../../config/cors");
const {enqueueTask} = require("../../utils/cloudTasks");

const admin = initializeFirebase();

const regenerateAllIllustrations = createHttpsHandler(async (req, res) => {
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

      const taskId = await enqueueTask("emojiregeneration", {}, userId);

      res.status(202).json({
        success: true,
        message: "Illustration regeneration has been queued.",
        taskId: taskId,
      });
    } catch (error) {
      logger.error("Error queueing illustration regeneration", {
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
        error: "Failed to queue illustration regeneration task.",
        message: error.message,
      });
    }
  });
});

module.exports = regenerateAllIllustrations;
