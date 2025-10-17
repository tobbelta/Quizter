const {logger} = require("firebase-functions");
const {createHttpsHandler} = require("../../utils/middleware");
const {corsMiddleware} = require("../../config/cors");
const {ensurePost} = require("../../utils/middleware");
const {stripeSecretKey} = require("../../config/runtime");

/**
 * Creates a Stripe PaymentIntent for a run participant.
 * Handles amount validation, Stripe initialization,
 * and comprehensive error handling.
 * @param {Object} req.body - { runId, participantId, amount, currency }
 * @returns {Object} - { client_secret, payment_intent_id } or error
 */
module.exports = createHttpsHandler(async (req, res) => {
  return corsMiddleware(req, res, async () => {
    if (!ensurePost(req, res)) {
      return;
    }

    try {
      const {runId, participantId, amount, currency = "sek"} = req.body;

      // Validera input
      if (!runId || !participantId || !amount) {
        res.status(400).json({
          error: "Missing required fields: runId, participantId, amount",
        });
        return;
      }

      if (amount < 100 || amount > 100000) {
        res.status(400).json({
          error:
            "Amount must be between 100 and 100000 öre (1-1000 kr)",
        });
        return;
      }

      // Hämta Stripe secret key från environment
      const secretKey = stripeSecretKey.value();
      if (!secretKey) {
        logger.error("Stripe secret key not configured");
        res.status(500).json({
          error: "Payment system not configured",
        });
        return;
      }

      // Initiera Stripe
      const stripe = require("stripe")(secretKey);

      // Skapa PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        metadata: {
          runId,
          participantId,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      logger.info("PaymentIntent created", {
        paymentIntentId: paymentIntent.id,
        runId,
        participantId,
        amount,
      });

      res.status(200).json({
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
      });
    } catch (error) {
      const stripeMessage = error?.raw?.message || error?.message;

      const errorInfo = {
        message: stripeMessage,
        code: error?.code,
        type: error?.type,
        statusCode: error?.statusCode,
        requestId: error?.requestId,
      };

      logger.error("Error creating PaymentIntent", errorInfo);

      const isAuthError = error?.code === "api_key_expired" ||
        error?.code === "authentication_error" ||
        error?.type === "StripeAuthenticationError" ||
        error?.statusCode === 401;
      const isConnectionError = error?.code === "api_connection_error" ||
        error?.type === "StripeAPIError" ||
        error?.type === "StripeConnectionError";
      const isRateLimited = error?.code === "rate_limit_error" ||
        error?.type === "StripeRateLimitError" ||
        error?.statusCode === 429;

      let status = 500;
      let errorCode = "PAYMENT_INTENT_FAILED";
      let clientMessage = "Failed to create payment";
      let retryable = true;

      if (isAuthError) {
        errorCode = "STRIPE_AUTH_ERROR";
        clientMessage =
          "Betalningssystemet behöver uppdateras. " +
          "Kontakta administratören.";
        retryable = false;
      } else if (isConnectionError) {
        errorCode = "STRIPE_UNAVAILABLE";
        clientMessage =
          "Stripe svarar inte just nu. " +
          "Försök igen om en liten stund.";
        status = 503;
      } else if (isRateLimited) {
        errorCode = "STRIPE_RATE_LIMIT";
        clientMessage =
          "För många betalningsförsök på kort tid. " +
          "Vänta och prova igen.";
        status = 429;
      }

      const responsePayload = {
        error: clientMessage,
        errorCode,
        retryable,
      };

      if (process.env.NODE_ENV !== "production") {
        responsePayload.debug = {
          ...errorInfo,
          rawMessage: stripeMessage,
        };
      }

      res.status(status).json(responsePayload);
    }
  });
});
