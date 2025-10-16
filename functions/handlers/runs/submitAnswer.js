/**
 * Submit Answer Handler
 * Records participant answers and updates scores
 */
const logger = require("firebase-functions/logger");
const {createHttpsHandler, ensurePost} = require("../../utils/middleware");

const submitAnswer = createHttpsHandler(async (req, res) => {
  // TODO: Uppdatera deltagarens svar och poäng.
  if (!ensurePost(req, res)) {
    return;
  }

  logger.info("submitAnswer called", {participantId: req.body?.participantId});
  res.status(501).json({error: "Not implemented"});
});

module.exports = submitAnswer;
