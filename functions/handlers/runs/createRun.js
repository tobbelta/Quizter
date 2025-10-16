/**
 * Create Run Handler
 * Creates a new tipspromenad run
 */
const logger = require("firebase-functions/logger");
const {createHttpsHandler, ensurePost} = require("../../utils/middleware");

const createRun = createHttpsHandler(async (req, res) => {
  // TODO: Validera payload, skapa run i Firestore och svara med id/kod.
  if (!ensurePost(req, res)) {
    return;
  }

  logger.info("createRun called", {bodyKeys: Object.keys(req.body || {})});
  res.status(501).json({error: "Not implemented"});
});

module.exports = createRun;
