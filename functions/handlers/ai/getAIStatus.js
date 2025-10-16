/**
 * Get AI Status Handler
 * Checks the status and availability of AI providers
 */
const logger = require("firebase-functions/logger");
const {createHttpsHandler} = require("../../utils/middleware");
const {corsMiddleware} = require("../../config/cors");
const {getProviderStatus} = require("../../utils/providers");

const getAIStatus = createHttpsHandler(async (req, res) => {
  return corsMiddleware(req, res, async () => {
    try {
      const {providers, primaryProvider, message} =
        await getProviderStatus({force: true});

      res.status(200).json({
        available: primaryProvider !== null,
        primaryProvider,
        providers,
        message,
      });
    } catch (error) {
      logger.error("Error checking AI status", {error: error.message});
      res.status(500).json({
        available: false,
        error: error.message,
        message: "Kunde inte kontrollera AI-status",
      });
    }
  });
});

module.exports = getAIStatus;
