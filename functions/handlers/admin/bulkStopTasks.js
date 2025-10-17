const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {corsMiddleware} = require("../../config/cors");
const {ensurePost} = require("../../utils/middleware");

/**
 * Stop multiple background tasks.
 * POST body: { taskIds: string[] }
 */
module.exports = onRequest({
  region: "europe-west1",
  timeoutSeconds: 300,
},
async (req, res) => {
  corsMiddleware(req, res, async () => {
    if (!ensurePost(req, res)) {
      return;
    }

    try {
      const {taskIds} = req.body;

      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({
          error: "taskIds must be a non-empty array",
        });
      }

      const db = admin.firestore();
      let stoppedCount = 0;
      const batchOps = [];
      let currentBatch = db.batch();
      let batchCount = 0;

      for (const taskId of taskIds) {
        const taskRef = db.collection("backgroundTasks").doc(taskId);
        const taskDoc = await taskRef.get();

        if (taskDoc.exists) {
          const taskData = taskDoc.data();
          const currentStatus = taskData.status;

          // Only stop tasks that are running
          if (["processing", "queued", "pending"].includes(currentStatus)) {
            currentBatch.update(taskRef, {
              status: "cancelled",
              finishedAt: admin.firestore.FieldValue.serverTimestamp(),
              error: "Task manually cancelled by user",
            });
            stoppedCount++;
            batchCount++;

            if (batchCount >= 400) {
              batchOps.push(currentBatch.commit());
              currentBatch = db.batch();
              batchCount = 0;
            }
          }
        }
      }

      // Commit remaining batch
      if (batchCount > 0) {
        batchOps.push(currentBatch.commit());
      }

      await Promise.all(batchOps);

      logger.info("Bulk stop tasks completed", {
        stopped: stoppedCount,
        requested: taskIds.length,
      });

      res.status(200).json({
        success: true,
        message: `Stopped ${stoppedCount} tasks`,
        stopped: stoppedCount,
        requested: taskIds.length,
      });
    } catch (error) {
      logger.error("Error bulk stopping tasks", {error: error.message});
      res.status(500).json({
        error: "Failed to bulk stop tasks",
        message: error.message,
      });
    }
  });
});
