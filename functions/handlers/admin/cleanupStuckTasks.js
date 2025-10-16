const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {cors} = require("../../config/cors");

/**
 * Cleanup stuck background tasks (processing/queued for too long).
 * Processing tasks: 30 min timeout (3 hours for batch validation)
 * Queued tasks: 30 min timeout
 */
module.exports = onRequest({
  region: "europe-west1",
  timeoutSeconds: 300, // 5 minutes
}, async (req, res) => {
  cors(req, res, async () => {
    try {
      logger.info("Starting cleanup of stuck background tasks");

      const db = admin.firestore();
      const tasksRef = db.collection("backgroundTasks");

      // Find all tasks that are "processing" or "queued"
      const processingSnapshot =
        await tasksRef.where("status", "==", "processing").get();
      const queuedSnapshot =
        await tasksRef.where("status", "==", "queued").get();

      const now = admin.firestore.Timestamp.now();
      const thirtyMinutesAgo =
        admin.firestore.Timestamp.fromMillis(
            now.toMillis() - 30 * 60 * 1000,
        );
      const threeHoursAgo =
        admin.firestore.Timestamp.fromMillis(
            now.toMillis() - 3 * 60 * 60 * 1000,
        );

      let cleanedCount = 0;
      const batchOps = [];
      let currentBatch = db.batch();
      let batchCount = 0;

      // Check processing tasks
      for (const doc of processingSnapshot.docs) {
        const data = doc.data();
        const createdAt = data.createdAt || data.startedAt;

        // Batch validation tasks get 3 hours, others get 30 minutes
        const taskType = data.taskType;
        const timeoutThreshold =
          taskType === "batchvalidation" ?
            threeHoursAgo : thirtyMinutesAgo;
        const timeoutMinutes = taskType === "batchvalidation" ? 180 : 30;

        if (
          createdAt &&
          createdAt.toMillis() < timeoutThreshold.toMillis()
        ) {
          currentBatch.update(doc.ref, {
            status: "failed",
            error: `Task timed out after ${timeoutMinutes} minutes`,
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          cleanedCount++;
          batchCount++;

          // Firestore batch limit is 500
          if (batchCount >= 400) {
            batchOps.push(currentBatch.commit());
            currentBatch = db.batch();
            batchCount = 0;
          }
        }
      }

      // Check queued tasks
      for (const doc of queuedSnapshot.docs) {
        const data = doc.data();
        const createdAt = data.createdAt;

        if (
          createdAt &&
          createdAt.toMillis() < thirtyMinutesAgo.toMillis()
        ) {
          currentBatch.update(doc.ref, {
            status: "failed",
            error: "Task stuck in queue for more than 30 minutes",
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          cleanedCount++;
          batchCount++;

          if (batchCount >= 400) {
            batchOps.push(currentBatch.commit());
            currentBatch = db.batch();
            batchCount = 0;
          }
        }
      }

      // Commit remaining batch
      if (batchCount > 0) {
        batchOps.push(currentBatch.commit());
      }

      await Promise.all(batchOps);

      logger.info("Finished cleaning up stuck tasks", {
        cleaned: cleanedCount,
      });

      res.status(200).json({
        message: "Cleanup completed successfully",
        cleaned: cleanedCount,
        processingChecked: processingSnapshot.size,
        queuedChecked: queuedSnapshot.size,
      });
    } catch (error) {
      logger.error("Error cleaning up stuck tasks", {
        error: error.message,
      });
      res.status(500).json({
        error: "Failed to cleanup stuck tasks",
        message: error.message,
      });
    }
  });
});
