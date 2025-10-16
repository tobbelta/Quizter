/**
 * Close Run Handler
 * Closes a tipspromenad run
 */
const logger = require("firebase-functions/logger");
const {createHttpsHandler, ensurePost} = require("../../utils/middleware");

const closeRun = createHttpsHandler(async (req, res) => {
  // TODO: Stäng rundan och skriv closedAt i Firestore.
  if (!ensurePost(req, res)) {
    return;
  }

  logger.info("closeRun called", {runId: req.body?.runId});
  res.status(501).json({error: "Not implemented"});
});

module.exports = closeRun;
