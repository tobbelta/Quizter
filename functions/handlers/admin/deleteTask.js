const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {corsMiddleware} = require("../../config/cors");
const {ensurePost} = require("../../utils/middleware");

/**
 * Delete a single background task.
 * POST body: { taskId: string }
 */
module.exports = onRequest({
  region: "europe-west1",
  timeoutSeconds: 60,
},
async (req, res) => {
  corsMiddleware(req, res, async () => {
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

      await taskRef.delete();

      logger.info("Task deleted", {taskId});

      res.status(200).json({
        success: true,
        message: "Task deleted successfully",
        taskId,
      });
    } catch (error) {
      logger.error("Error deleting task", {error: error.message});
      res.status(500).json({
        error: "Failed to delete task",
        message: error.message,
      });
    }
  });
});
