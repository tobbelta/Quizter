const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {cors} = require("../../config/cors");

/**
 * Delete old completed and failed background tasks.
 * Query parameter: ?hours=24 (default 24 hours)
 * Call this:
 * https://europe-west1-geoquest2-7e45c.cloudfunctions.net/deleteOldTasks
 */
module.exports = onRequest({
  region: "europe-west1",
  timeoutSeconds: 300, // 5 minutes
}, async (req, res) => {
  cors(req, res, async () => {
    try {
      logger.info("Starting deletion of old background tasks");

      const db = admin.firestore();
      const tasksRef = db.collection("backgroundTasks");

      // Get query parameter for age threshold (default 24 hours)
      const hoursOld = parseInt(req.query.hours) || 24;

      const now = admin.firestore.Timestamp.now();
      const thresholdTime =
        admin.firestore.Timestamp.fromMillis(
            now.toMillis() - hoursOld * 60 * 60 * 1000,
        );

      // Find all completed and failed tasks older than threshold
      const completedSnapshot = await tasksRef
          .where("status", "==", "completed")
          .where("finishedAt", "<", thresholdTime)
          .get();

      const failedSnapshot = await tasksRef
          .where("status", "==", "failed")
          .where("finishedAt", "<", thresholdTime)
          .get();

      let deletedCount = 0;
      const batchOps = [];
      let currentBatch = db.batch();
      let batchCount = 0;

      // Delete completed tasks
      for (const doc of completedSnapshot.docs) {
        currentBatch.delete(doc.ref);
        deletedCount++;
        batchCount++;

        if (batchCount >= 400) {
          batchOps.push(currentBatch.commit());
          currentBatch = db.batch();
          batchCount = 0;
        }
      }

      // Delete failed tasks
      for (const doc of failedSnapshot.docs) {
        currentBatch.delete(doc.ref);
        deletedCount++;
        batchCount++;

        if (batchCount >= 400) {
          batchOps.push(currentBatch.commit());
          currentBatch = db.batch();
          batchCount = 0;
        }
      }

      // Commit remaining batch
      if (batchCount > 0) {
        batchOps.push(currentBatch.commit());
      }

      await Promise.all(batchOps);

      logger.info("Finished deleting old tasks", {
        deleted: deletedCount,
        hoursOld,
      });

      res.status(200).json({
        message: "Old tasks deleted successfully",
        deleted: deletedCount,
        completedDeleted: completedSnapshot.size,
        failedDeleted: failedSnapshot.size,
        hoursOld,
      });
    } catch (error) {
      logger.error("Error deleting old tasks", {error: error.message});
      res.status(500).json({
        error: "Failed to delete old tasks",
        message: error.message,
      });
    }
  });
});
