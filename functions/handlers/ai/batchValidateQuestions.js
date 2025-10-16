/**
 * Batch Validate Questions Handler
 * Queues a task to validate multiple questions
 */
const logger = require("firebase-functions/logger");
const {initializeFirebase} = require("../../config/firebase");
const {createHttpsHandler, ensurePost} = require("../../utils/middleware");
const {corsMiddleware} = require("../../config/cors");
const {enqueueTask} = require("../../utils/cloudTasks");

const admin = initializeFirebase();

const batchValidateQuestions = createHttpsHandler(async (req, res) => {
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

      const {questions} = req.body;

      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({
          error: "questions must be a non-empty array",
        });
      }

      // Validate each question has required fields
      for (const q of questions) {
        if (
          !q.id || !q.question || !q.options ||
          q.correctOption === undefined || !q.explanation
        ) {
          return res.status(400).json({
            error: "Each question must have: id, question, options, " +
              "correctOption, explanation",
          });
        }
      }

      const taskId = await enqueueTask("batchvalidation", {questions}, userId);

      res.status(202).json({
        success: true,
        message: `Batch validation of ${
          questions.length} questions has been queued.`,
        taskId: taskId,
        questionCount: questions.length,
      });
    } catch (error) {
      logger.error("Error queueing batch question validation", {
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
        error: "Failed to queue batch validation task.",
        message: error.message,
      });
    }
  });
});

module.exports = batchValidateQuestions;
