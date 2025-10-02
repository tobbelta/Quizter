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
// Define Anthropic API key parameter
const anthropicApiKey = defineString("ANTHROPIC_API_KEY");
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
 * Hämta AI-status (krediter och tillgänglighet)
 */
exports.getAIStatus = createHttpsHandler(async (req, res) => {
  return cors(req, res, async () => {
    try {
      const apiKey = anthropicApiKey.value();

      if (!apiKey) {
        res.status(200).json({
          configured: false,
          available: false,
          message: "Anthropic API-nyckel inte konfigurerad"
        });
        return;
      }

      // Testa API:et med en minimal request
      const Anthropic = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey });

      try {
        await anthropic.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        });

        res.status(200).json({
          configured: true,
          available: true,
          model: 'claude-3-5-haiku-20241022',
          message: "AI-generering tillgänglig"
        });
      } catch (apiError) {
        logger.error("Anthropic API error", { error: apiError.message });

        // Kolla om det är kredit-problem
        const isCreditsError = apiError.message?.includes('credit') ||
                               apiError.message?.includes('quota') ||
                               apiError.status === 429;

        res.status(200).json({
          configured: true,
          available: false,
          error: apiError.message,
          isCreditsIssue: isCreditsError,
          message: isCreditsError ?
            "AI-krediter slut - kontrollera Anthropic Console" :
            "AI-tjänst ej tillgänglig"
        });
      }
    } catch (error) {
      logger.error("Error checking AI status", { error: error.message });
      res.status(500).json({
        configured: false,
        available: false,
        error: error.message
      });
    }
  });
});

/**
 * Generera frågor manuellt med AI (HTTP endpoint)
 * Använder Anthropic Claude som primär, OpenAI som fallback
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

      let questions = null;
      let usedProvider = null;

      // Försök med Anthropic först
      const anthropicKey = anthropicApiKey.value();
      if (anthropicKey) {
        try {
          const { generateQuestions: generateWithAnthropic } = require('./services/aiQuestionGenerator');
          logger.info("Trying Anthropic Claude", { amount, category, difficulty });

          questions = await generateWithAnthropic({ amount, category, difficulty }, anthropicKey);
          usedProvider = 'anthropic';
          logger.info("Successfully generated with Anthropic");
        } catch (anthropicError) {
          logger.warn("Anthropic failed, trying OpenAI fallback", {
            error: anthropicError.message
          });
        }
      }

      // Fallback till OpenAI om Anthropic misslyckades eller inte konfigurerad
      if (!questions) {
        const openaiKey = openaiApiKey.value();
        if (!openaiKey) {
          logger.error("Neither Anthropic nor OpenAI API keys are configured");
          res.status(500).json({
            error: "AI question generation not configured"
          });
          return;
        }

        try {
          const { generateQuestions: generateWithOpenAI } = require('./services/openaiQuestionGenerator');
          logger.info("Trying OpenAI", { amount, category, difficulty });

          questions = await generateWithOpenAI({ amount, category, difficulty }, openaiKey);
          usedProvider = 'openai';
          logger.info("Successfully generated with OpenAI");
        } catch (openaiError) {
          logger.error("OpenAI also failed", { error: openaiError.message });
          res.status(500).json({
            error: "Failed to generate questions with both AI providers",
            details: openaiError.message
          });
          return;
        }
      }

      // Spara till Firestore
      const db = admin.firestore();
      const batch = db.batch();

      questions.forEach(question => {
        const docRef = db.collection('questions').doc(question.id);
        batch.set(docRef, question);
      });

      await batch.commit();

      logger.info("Successfully generated and saved AI questions", {
        count: questions.length,
        provider: usedProvider
      });

      res.status(200).json({
        success: true,
        count: questions.length,
        provider: usedProvider,
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
// Använder Anthropic som primär, OpenAI som fallback
exports.questionImport = onSchedule(
  {
    schedule: "every 6 hours",
    region: REGION
  },
  async (event) => {
    logger.info("questionImport trigger executed", { timestamp: event.scheduleTime });

    try {
      let questions = null;
      let usedProvider = null;

      // Försök med Anthropic först
      const anthropicKey = anthropicApiKey.value();
      if (anthropicKey) {
        try {
          const { generateQuestions } = require('./services/aiQuestionGenerator');
          questions = await generateQuestions({ amount: 5 }, anthropicKey);
          usedProvider = 'anthropic';
          logger.info("Generated with Anthropic");
        } catch (anthropicError) {
          logger.warn("Anthropic failed in scheduled import, trying OpenAI", {
            error: anthropicError.message
          });
        }
      }

      // Fallback till OpenAI
      if (!questions) {
        const openaiKey = openaiApiKey.value();
        if (!openaiKey) {
          logger.warn("Neither Anthropic nor OpenAI configured, skipping automatic question import");
          return;
        }

        const { generateQuestions } = require('./services/openaiQuestionGenerator');
        questions = await generateQuestions({ amount: 5 }, openaiKey);
        usedProvider = 'openai';
        logger.info("Generated with OpenAI");
      }

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
        provider: usedProvider,
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
