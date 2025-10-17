/**
 * Queue Migration Handler
 * Queues a task to migrate questions to new schema with AI categorization
 */
const logger = require("firebase-functions/logger");
const {initializeFirebase} = require("../../config/firebase");
const {createHttpsHandler, ensurePost} = require("../../utils/middleware");
const {corsMiddleware} = require("../../config/cors");
const {enqueueTask} = require("../../utils/cloudTasks");

const admin = initializeFirebase();

const queueMigration = createHttpsHandler(async (req, res) => {
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

      const taskId = await enqueueTask("migration", {}, userId);

      res.status(202).json({
        success: true,
        message: "Question migration has been queued.",
        taskId: taskId,
      });
    } catch (error) {
      logger.error("Error queueing AI question migration", {
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
        error: "Failed to queue question migration task.",
        message: error.message,
      });
    }
  });
});

module.exports = queueMigration;
