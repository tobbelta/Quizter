const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {cors} = require("../../config/cors");
const {ensurePost} = require("../../utils/middleware");

/**
 * Stop a single background task.
 * POST body: { taskId: string }
 */
module.exports = onRequest({
  region: "europe-west1",
  timeoutSeconds: 60,
}, async (req, res) => {
  cors(req, res, async () => {
    if (!ensurePost(req, res)) {
      return;
    }

    try {
      const {taskId} = req.body;

      if (!taskId) {
        return res.status(400).json({error: "taskId is required"});
      }

      const db = admin.firestore();
      const taskRef = db.collection("backgroundTasks").doc(taskId);
      const taskDoc = await taskRef.get();

      if (!taskDoc.exists) {
        return res.status(404).json({error: "Task not found"});
      }

      const taskData = taskDoc.data();
      const currentStatus = taskData.status;

      // Only allow stopping tasks that are running
      if (!["processing", "queued", "pending"].includes(currentStatus)) {
        return res.status(400).json({
          error: `Cannot stop task with status: ${currentStatus}`,
          message:
            "Only processing, queued, or pending tasks can be stopped",
        });
      }

      await taskRef.update({
        status: "cancelled",
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: "Task manually cancelled by user",
      });

      logger.info("Task stopped", {taskId});

      res.status(200).json({
        success: true,
        message: "Task stopped successfully",
        taskId,
      });
    } catch (error) {
      logger.error("Error stopping task", {error: error.message});
      res.status(500).json({
        error: "Failed to stop task",
        message: error.message,
      });
    }
  });
});
