/**
 * Cloud Functions-skelett för tipspromenadens backend-endpoints.
 */
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineString} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// CORS-konfiguration för att tillåta routequest.se och andra domäner
const cors = require("cors")({
  origin: [
    "https://routequest.se",
    "https://www.routequest.se",
    "https://geoquest2-7e45c.firebaseapp.com",
    "https://geoquest2-7e45c.web.app",
    "http://localhost:3000" // För lokal utveckling
  ],
  credentials: true
});

// Define Stripe secret key parameter
const stripeSecretKey = defineString("STRIPE_SECRET_KEY");
// Define OpenAI API key parameter
const openaiApiKey = defineString("OPENAI_API_KEY");

if (!admin.apps.length) {
  admin.initializeApp();
}

const REGION = "europe-west1";
const runtimeDefaults = {
  region: REGION,
  memory: "512MB",
  timeoutSeconds: 60
};

const createHttpsHandler = (handler) =>
  onRequest(runtimeDefaults, handler);

const ensurePost = (req, res) => {
  if (req.method !== "POST") {
    res.set("Allow", "POST");
    res.status(405).json({ error: "Method Not Allowed" });
    return false;
  }
  return true;
};

exports.createRun = createHttpsHandler(async (req, res) => {
  // TODO: Validera payload, skapa run i Firestore och svara med id/kod.
  if (!ensurePost(req, res)) {
    return;
  }

  logger.info("createRun called", { bodyKeys: Object.keys(req.body || {}) });
  res.status(501).json({ error: "Not implemented" });
});

exports.generateRoute = createHttpsHandler(async (req, res) => {
  // TODO: Anropa kart-API, skapa checkpoints och spara rundan.
  if (!ensurePost(req, res)) {
    return;
  }

  logger.info("generateRoute called", { payload: req.body });
  res.status(501).json({ error: "Not implemented" });
});

exports.joinRun = createHttpsHandler(async (req, res) => {
  // TODO: Registrera deltagare och returnera token/svarsdata.
  if (!ensurePost(req, res)) {
    return;
  }

  logger.info("joinRun called", { bodyKeys: Object.keys(req.body || {}) });
  res.status(501).json({ error: "Not implemented" });
});

exports.submitAnswer = createHttpsHandler(async (req, res) => {
  // TODO: Uppdatera deltagarens svar och poäng.
  if (!ensurePost(req, res)) {
    return;
  }

  logger.info("submitAnswer called", { participantId: req.body?.participantId });
  res.status(501).json({ error: "Not implemented" });
});

exports.closeRun = createHttpsHandler(async (req, res) => {
  // TODO: Stäng rundan och skriv closedAt i Firestore.
  if (!ensurePost(req, res)) {
    return;
  }

  logger.info("closeRun called", { runId: req.body?.runId });
  res.status(501).json({ error: "Not implemented" });
});

/**
 * Generera frågor manuellt med AI (HTTP endpoint)
 */
exports.generateAIQuestions = createHttpsHandler(async (req, res) => {
  return cors(req, res, async () => {
    if (!ensurePost(req, res)) {
      return;
    }

    try {
      const { amount = 10, category, difficulty } = req.body;

      // Validera amount
      if (amount < 1 || amount > 50) {
        res.status(400).json({
          error: "Amount must be between 1 and 50"
        });
        return;
      }

      const apiKey = openaiApiKey.value();
      if (!apiKey) {
        logger.error("OpenAI API key not configured");
        res.status(500).json({
          error: "AI question generation not configured"
        });
        return;
      }

      const { generateQuestions } = require('./services/aiQuestionGenerator');

      logger.info("Generating AI questions", { amount, category, difficulty });

      const questions = await generateQuestions({ amount, category, difficulty }, apiKey);

      // Spara till Firestore
      const db = admin.firestore();
      const batch = db.batch();

      questions.forEach(question => {
        const docRef = db.collection('questions').doc(question.id);
        batch.set(docRef, question);
      });

      await batch.commit();

      logger.info("Successfully generated and saved AI questions", {
        count: questions.length
      });

      res.status(200).json({
        success: true,
        count: questions.length,
        questions: questions
      });
    } catch (error) {
      logger.error("Error generating AI questions", {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({
        error: "Failed to generate questions",
        message: error.message
      });
    }
  });
});

// Schemalagd funktion som ska hämta fler frågor löpande med AI.
exports.questionImport = onSchedule(
  {
    schedule: "every 6 hours",
    region: REGION
  },
  async (event) => {
    logger.info("questionImport trigger executed", { timestamp: event.scheduleTime });

    try {
      const { generateQuestions } = require('./services/aiQuestionGenerator');
      const apiKey = openaiApiKey.value();

      if (!apiKey) {
        logger.warn("OpenAI API key not configured, skipping automatic question import");
        return;
      }

      // Generera 5 frågor var 6:e timme (120 frågor/månad)
      const questions = await generateQuestions({ amount: 5 }, apiKey);

      // Spara till Firestore
      const db = admin.firestore();
      const batch = db.batch();

      questions.forEach(question => {
        const docRef = db.collection('questions').doc(question.id);
        batch.set(docRef, question);
      });

      await batch.commit();

      logger.info("Successfully imported AI-generated questions", {
        count: questions.length,
        timestamp: event.scheduleTime
      });
    } catch (error) {
      logger.error("Failed to import questions", {
        error: error.message,
        stack: error.stack
      });
    }
  }
);

/**
 * Stripe Payment Intent Creation
 */
exports.createPaymentIntent = createHttpsHandler(async (req, res) => {
  return cors(req, res, async () => {
    if (!ensurePost(req, res)) {
      return;
    }

    try {
      const { runId, participantId, amount, currency = "sek" } = req.body;

      // Validera input
      if (!runId || !participantId || !amount) {
        res.status(400).json({
          error: "Missing required fields: runId, participantId, amount",
        });
        return;
      }

      if (amount < 100 || amount > 100000) {
        res.status(400).json({
          error: "Amount must be between 100 and 100000 öre (1-1000 kr)",
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
      logger.error("Error creating PaymentIntent", { error: error.message });
      res.status(500).json({
        error: "Failed to create payment",
        message: error.message,
      });
    }
  });
});
