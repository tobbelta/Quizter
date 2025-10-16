const {logger} = require("firebase-functions");
const {createHttpsHandler} = require("../../utils/middleware");
const {cors} = require("../../config/cors");
const {stripeSecretKey} = require("../../config/runtime");

/**
 * Stripe status health-check.
 * Returnerar kontoinformation och om nyckeln är giltig
 * utan att skapa en betalning.
 * @returns {Object} - Account info or error
 */
module.exports = createHttpsHandler(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "GET") {
      res.set("Allow", "GET");
      res.status(405).json({error: "Method Not Allowed"});
      return;
    }

    const secretKey = stripeSecretKey.value();
    if (!secretKey) {
      logger.error("Stripe secret key not configured for status check");
      res.status(500).json({
        success: false,
        error: "Payment system not configured",
        errorCode: "STRIPE_KEY_MISSING",
      });
      return;
    }

    try {
      const stripe = require("stripe")(secretKey);
      const account = await stripe.accounts.retrieve();

      res.status(200).json({
        success: true,
        accountId: account.id,
        livemode: account.livemode,
        defaultCurrency: account.default_currency,
        payoutsEnabled: account.payouts_enabled,
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

      logger.error("Stripe status check failed", errorInfo);

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
      let errorCode = "STRIPE_UNAVAILABLE";
      let clientMessage =
        "Kunde inte nå Stripe just nu. Försök igen senare.";
      let retryable = true;

      if (isAuthError) {
        status = 500;
        errorCode = "STRIPE_AUTH_ERROR";
        clientMessage = "Stripe-nyckeln är ogiltig eller har gått ut.";
        retryable = false;
      } else if (isConnectionError) {
        status = 503;
        errorCode = "STRIPE_UNAVAILABLE";
        clientMessage =
          "Kunde inte nå Stripe just nu. Försök igen senare.";
      } else if (isRateLimited) {
        status = 429;
        errorCode = "STRIPE_RATE_LIMIT";
        clientMessage =
          "Stripe begränsar förfrågningarna just nu. " +
          "Vänta och försök igen.";
      }

      const payload = {
        success: false,
        error: clientMessage,
        errorCode,
        retryable,
      };

      if (process.env.NODE_ENV !== "production") {
        payload.debug = {
          ...errorInfo,
          rawMessage: stripeMessage,
        };
      }

      res.status(status).json(payload);
    }
  });
});
