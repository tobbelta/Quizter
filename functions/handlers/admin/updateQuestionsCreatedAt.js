const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {corsMiddleware} = require("../../config/cors");

/**
 * One-time function to update all existing questions with createdAt field
 * Call this once:
 * https://europe-west1-geoquest2-7e45c.cloudfunctions.net/updateQuestionsCreatedAt
 */
module.exports = onRequest({
  region: "europe-west1",
  timeoutSeconds: 300, // 5 minutes
}, async (req, res) => {
  corsMiddleware(req, res, async () => {
    try {
      logger.info("Starting update of questions with createdAt field");

      const db = admin.firestore();
      const questionsRef = db.collection("questions");
      const snapshot = await questionsRef.get();

      if (snapshot.empty) {
        logger.info("No questions found in Firestore");
        return res.status(200).json({
          message: "No questions found",
          updated: 0,
        });
      }

      logger.info(`Found ${snapshot.size} questions`);

      let updatedCount = 0;
      let alreadyHasCount = 0;
      const batch = db.batch();
      let batchCount = 0;
      const batches = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();

        if (data.createdAt) {
          alreadyHasCount++;
          continue;
        }

        // Use generatedAt if it exists, otherwise use current timestamp
        const createdAt = data.generatedAt ?
          admin.firestore.Timestamp.fromDate(new Date(data.generatedAt)) :
          admin.firestore.FieldValue.serverTimestamp();

        batch.update(doc.ref, {createdAt});
        updatedCount++;
        batchCount++;

        // Firestore batch limit is 500, commit every 400 to be safe
        if (batchCount >= 400) {
          batches.push(batch.commit());
          batchCount = 0;
        }
      }

      // Commit any remaining updates
      if (batchCount > 0) {
        batches.push(batch.commit());
      }

      await Promise.all(batches);

      logger.info("Finished updating questions", {
        updated: updatedCount,
        alreadyHas: alreadyHasCount,
        total: snapshot.size,
      });

      res.status(200).json({
        message: "Questions updated successfully",
        updated: updatedCount,
        alreadyHas: alreadyHasCount,
        total: snapshot.size,
      });
    } catch (error) {
      logger.error("Error updating questions", {error: error.message});
      res.status(500).json({
        error: "Failed to update questions",
        message: error.message,
      });
    }
  });
});
