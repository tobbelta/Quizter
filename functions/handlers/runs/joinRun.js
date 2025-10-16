/**
 * Join Run Handler
 * Registers a participant for a tipspromenad run
 */
const logger = require("firebase-functions/logger");
const {createHttpsHandler, ensurePost} = require("../../utils/middleware");

const joinRun = createHttpsHandler(async (req, res) => {
  // TODO: Registrera deltagare och returnera token/svarsdata.
  if (!ensurePost(req, res)) {
    return;
  }

  logger.info("joinRun called", {bodyKeys: Object.keys(req.body || {})});
  res.status(501).json({error: "Not implemented"});
});

module.exports = joinRun;
