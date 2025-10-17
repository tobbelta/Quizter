const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {cors} = require("../../config/cors");
const {ensurePost} = require("../../utils/middleware");

/**
 * Delete multiple background tasks.
 * POST body: { taskIds: string[] }
 */
module.exports = onRequest({
  region: "europe-west1",
  timeoutSeconds: 300,
},
async (req, res) => {
  cors(req, res, async () => {
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
      let deletedCount = 0;
      const batchOps = [];
      let currentBatch = db.batch();
      let batchCount = 0;

      for (const taskId of taskIds) {
        const taskRef = db.collection("backgroundTasks").doc(taskId);
        currentBatch.delete(taskRef);
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

      logger.info("Bulk delete tasks completed", {
        deleted: deletedCount,
        requested: taskIds.length,
      });

      res.status(200).json({
        success: true,
        message: `Deleted ${deletedCount} tasks`,
        deleted: deletedCount,
        requested: taskIds.length,
      });
    } catch (error) {
      logger.error("Error bulk deleting tasks", {error: error.message});
      res.status(500).json({
        error: "Failed to bulk delete tasks",
        message: error.message,
      });
    }
  });
});

