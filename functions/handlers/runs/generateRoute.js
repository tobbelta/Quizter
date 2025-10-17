/**
 * Generate Route Handler
 * Generates a route with checkpoints for the run
 */
const logger = require("firebase-functions/logger");
const {createHttpsHandler, ensurePost} = require("../../utils/middleware");

const generateRoute = createHttpsHandler(async (req, res) => {
  // TODO: Anropa kart-API, skapa checkpoints och spara rundan.
  if (!ensurePost(req, res)) {
    return;
  }

  logger.info("generateRoute called", {payload: req.body});
  res.status(501).json({error: "Not implemented"});
});

module.exports = generateRoute;
