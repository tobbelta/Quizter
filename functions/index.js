/**
 * Cloud Functions-skelett för tipspromenadens backend-endpoints.
 */
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineString, defineSecret} = require("firebase-functions/params");
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
// Define AI API keys as secrets
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const openaiApiKey = defineSecret("OPENAI_API_KEY");
const geminiApiKey = defineSecret("GEMINI_API_KEY");

if (!admin.apps.length) {
  admin.initializeApp();
}

const REGION = "europe-west1";
const runtimeDefaults = {
  region: REGION,
  memory: "512MB",
  timeoutSeconds: 60,
  secrets: [anthropicApiKey, openaiApiKey, geminiApiKey]
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
 * Hämta AI-status (krediter och tillgänglighet för alla providers)
 */
exports.getAIStatus = createHttpsHandler(async (req, res) => {
  return cors(req, res, async () => {
    try {
      const providers = {
        anthropic: { configured: false, available: false },
        openai: { configured: false, available: false },
        gemini: { configured: false, available: false }
      };

      // Testa Anthropic
      const anthropicKey = anthropicApiKey.value();
      if (anthropicKey) {
        providers.anthropic.configured = true;
        try {
          const Anthropic = require('@anthropic-ai/sdk');
          const anthropic = new Anthropic({ apiKey: anthropicKey });

          await anthropic.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Hi' }]
          });

          providers.anthropic.available = true;
          providers.anthropic.model = 'claude-3-5-haiku-20241022';
        } catch (error) {
          logger.warn("Anthropic unavailable", { error: error.message });
          providers.anthropic.error = error.message;
          providers.anthropic.errorStatus = error.status;
        }
      }

      // Testa OpenAI
      const openaiKey = openaiApiKey.value();
      if (openaiKey) {
        providers.openai.configured = true;
        try {
          const OpenAI = require('openai');
          const openai = new OpenAI({ apiKey: openaiKey });

          await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 10
          });

          providers.openai.available = true;
          providers.openai.model = 'gpt-4o-mini';
        } catch (error) {
          logger.warn("OpenAI unavailable", { error: error.message });
          providers.openai.error = error.message;
        }
      }

      // Testa Gemini - lista tillgängliga modeller först
      const geminiKey = geminiApiKey.value();
      if (geminiKey) {
        providers.gemini.configured = true;
        try {
          // Lista tillgängliga modeller
          const listResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`
          );

          if (listResponse.ok) {
            const modelData = await listResponse.json();
            const availableModels = modelData.models || [];

            // Hitta första modellen som stöder generateContent
            const compatibleModel = availableModels.find(m =>
              m.supportedGenerationMethods?.includes('generateContent')
            );

            if (compatibleModel) {
              providers.gemini.available = true;
              providers.gemini.model = compatibleModel.name.replace('models/', '');
              providers.gemini.availableModels = availableModels.map(m => m.name);
            } else {
              throw new Error('No compatible Gemini models found');
            }
          } else {
            const errorText = await listResponse.text();
            throw new Error(`Failed to list models: ${errorText}`);
          }
        } catch (error) {
          logger.warn("Gemini unavailable", { error: error.message });
          providers.gemini.error = error.message;
        }
      }

      // Bestäm vilken provider som kommer användas (prioritetsordning)
      let primaryProvider = null;
      let message = "Ingen AI-tjänst konfigurerad";

      if (providers.anthropic.available) {
        primaryProvider = 'anthropic';
        message = `AI-generering tillgänglig (Anthropic Claude)`;
      } else if (providers.openai.available) {
        primaryProvider = 'openai';
        message = `AI-generering tillgänglig (OpenAI fallback)`;
      } else if (providers.gemini.available) {
        primaryProvider = 'gemini';
        message = `AI-generering tillgänglig (Gemini fallback)`;
      } else if (providers.anthropic.configured || providers.openai.configured || providers.gemini.configured) {
        message = "Alla AI-tjänster ej tillgängliga - kontrollera API-nycklar";
      }

      res.status(200).json({
        available: primaryProvider !== null,
        primaryProvider,
        providers,
        message
      });
    } catch (error) {
      logger.error("Error checking AI status", { error: error.message });
      res.status(500).json({
        available: false,
        error: error.message,
        message: "Kunde inte kontrollera AI-status"
      });
    }
  });
});

/**
 * Generera frågor manuellt med AI (HTTP endpoint)
 * Använder Anthropic Claude som primär, OpenAI som andra fallback, Gemini som tredje fallback
 */
exports.generateAIQuestions = createHttpsHandler(async (req, res) => {
  return cors(req, res, async () => {
    if (!ensurePost(req, res)) {
      return;
    }

    try {
      const { amount = 10, category, difficulty, provider = 'anthropic' } = req.body;

      // Validera amount
      if (amount < 1 || amount > 50) {
        res.status(400).json({
          error: "Amount must be between 1 and 50"
        });
        return;
      }

      let questions = null;
      let usedProvider = null;

      // Använd den valda providern
      if (provider === 'gemini') {
        const geminiKey = geminiApiKey.value();
        if (geminiKey) {
          try {
            const { generateQuestions: generateWithGemini } = require('./services/geminiQuestionGenerator');
            logger.info("Using Gemini (user selected)", { amount, category, difficulty });
            questions = await generateWithGemini({ amount, category, difficulty }, geminiKey);
            usedProvider = 'gemini';
            logger.info("Successfully generated with Gemini");
          } catch (error) {
            logger.warn("Gemini failed", { error: error.message });
          }
        }
      } else if (provider === 'openai') {
        const openaiKey = openaiApiKey.value();
        if (openaiKey) {
          try {
            const { generateQuestions: generateWithOpenAI } = require('./services/openaiQuestionGenerator');
            logger.info("Using OpenAI (user selected)", { amount, category, difficulty });
            questions = await generateWithOpenAI({ amount, category, difficulty }, openaiKey);
            usedProvider = 'openai';
            logger.info("Successfully generated with OpenAI");
          } catch (error) {
            logger.warn("OpenAI failed", { error: error.message });
          }
        }
      } else {
        // Anthropic (default)
        const anthropicKey = anthropicApiKey.value();
        if (anthropicKey) {
          try {
            const { generateQuestions: generateWithAnthropic } = require('./services/aiQuestionGenerator');
            logger.info("Using Anthropic (user selected or default)", { amount, category, difficulty });
            questions = await generateWithAnthropic({ amount, category, difficulty }, anthropicKey);
            usedProvider = 'anthropic';
            logger.info("Successfully generated with Anthropic");
          } catch (error) {
            logger.warn("Anthropic failed", { error: error.message });
          }
        }
      }

      // Om vald provider misslyckades, returnera fel
      if (!questions) {
        logger.error(`Selected provider ${provider} failed or not configured`);
        res.status(500).json({
          error: `Failed to generate questions with ${provider}`,
          provider: provider
        });
        return;
      }

      // Spara till Firestore
      const db = admin.firestore();
      const batch = db.batch();

      questions.forEach(question => {
        const docRef = db.collection('questions').doc(question.id);
        // Lägg till createdAt om det inte finns
        const questionData = {
          ...question,
          createdAt: question.createdAt || admin.firestore.FieldValue.serverTimestamp()
        };
        batch.set(docRef, questionData);
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
// Använder Anthropic som primär, OpenAI som andra fallback, Gemini som tredje fallback
exports.questionImport = onSchedule(
  {
    schedule: "every 6 hours",
    region: REGION,
    secrets: [anthropicApiKey, openaiApiKey, geminiApiKey]
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
          questions = await generateQuestions({ amount: 20 }, anthropicKey);
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
        if (openaiKey) {
          try {
            const { generateQuestions } = require('./services/openaiQuestionGenerator');
            questions = await generateQuestions({ amount: 20 }, openaiKey);
            usedProvider = 'openai';
            logger.info("Generated with OpenAI");
          } catch (openaiError) {
            logger.warn("OpenAI failed in scheduled import, trying Gemini", {
              error: openaiError.message
            });
          }
        }
      }

      // Fallback till Gemini
      if (!questions) {
        const geminiKey = geminiApiKey.value();
        if (!geminiKey) {
          logger.warn("No AI providers configured, skipping automatic question import");
          return;
        }

        const { generateQuestions } = require('./services/geminiQuestionGenerator');
        questions = await generateQuestions({ amount: 20 }, geminiKey);
        usedProvider = 'gemini';
        logger.info("Generated with Gemini");
      }

      // Spara till Firestore
      const db = admin.firestore();
      const batch = db.batch();

      questions.forEach(question => {
        const docRef = db.collection('questions').doc(question.id);
        // Lägg till createdAt om det inte finns
        const questionData = {
          ...question,
          createdAt: question.createdAt || admin.firestore.FieldValue.serverTimestamp()
        };
        batch.set(docRef, questionData);
      });

      await batch.commit();

      logger.info("Successfully imported AI-generated questions", {
        count: questions.length,
        provider: usedProvider,
        timestamp: event.scheduleTime
      });

      // Skapa notis till superusers
      try {
        const notificationRef = db.collection('notifications').doc();
        await notificationRef.set({
          type: 'question_import',
          title: 'Automatisk frågegenerering slutförd',
          message: `${questions.length} nya frågor har genererats med ${usedProvider === 'anthropic' ? 'Anthropic Claude' : usedProvider === 'openai' ? 'OpenAI' : 'Google Gemini'}`,
          data: {
            count: questions.length,
            provider: usedProvider,
            model: questions[0]?.source || 'ai-generated',
            timestamp: new Date().toISOString()
          },
          targetAudience: 'superusers',
          read: false,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 dagar
        });
        logger.info("Notification created for superusers");
      } catch (notificationError) {
        logger.error("Failed to create notification", { error: notificationError.message });
      }

    } catch (error) {
      logger.error("Failed to import questions", {
        error: error.message,
        stack: error.stack
      });

      // Skapa felnotis till superusers
      try {
        const db = admin.firestore();
        const notificationRef = db.collection('notifications').doc();
        await notificationRef.set({
          type: 'question_import_error',
          title: 'Automatisk frågegenerering misslyckades',
          message: `Kunde inte generera frågor: ${error.message}`,
          data: {
            error: error.message,
            timestamp: new Date().toISOString()
          },
          targetAudience: 'superusers',
          read: false,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });
        logger.info("Error notification created for superusers");
      } catch (notificationError) {
        logger.error("Failed to create error notification", { error: notificationError.message });
      }
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

/**
 * One-time function to update all existing questions with createdAt field
 * Call this once: https://europe-west1-geoquest2-7e45c.cloudfunctions.net/updateQuestionsCreatedAt
 */
exports.updateQuestionsCreatedAt = onRequest({
  region: "europe-west1",
  timeoutSeconds: 300, // 5 minutes
}, async (req, res) => {
  cors(req, res, async () => {
    try {
      logger.info('Starting update of questions with createdAt field');

      const db = admin.firestore();
      const questionsRef = db.collection('questions');
      const snapshot = await questionsRef.get();

      if (snapshot.empty) {
        logger.info('No questions found in Firestore');
        return res.status(200).json({ message: 'No questions found', updated: 0 });
      }

      logger.info(`Found ${snapshot.size} questions`);

      let updatedCount = 0;
      let alreadyHasCount = 0;
      const batch = db.batch();
      let batchCount = 0;
      const batches = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();

        if (data.createdAt) {
          alreadyHasCount++;
          continue;
        }

        // Use generatedAt if it exists, otherwise use current timestamp
        const createdAt = data.generatedAt
          ? admin.firestore.Timestamp.fromDate(new Date(data.generatedAt))
          : admin.firestore.FieldValue.serverTimestamp();

        batch.update(doc.ref, { createdAt });
        updatedCount++;
        batchCount++;

        // Firestore batch limit is 500, commit every 400 to be safe
        if (batchCount >= 400) {
          batches.push(batch.commit());
          batchCount = 0;
        }
      }

      // Commit any remaining updates
      if (batchCount > 0) {
        batches.push(batch.commit());
      }

      await Promise.all(batches);

      logger.info('Finished updating questions', {
        updated: updatedCount,
        alreadyHad: alreadyHasCount,
        total: snapshot.size
      });

      res.status(200).json({
        message: 'Questions updated successfully',
        updated: updatedCount,
        alreadyHad: alreadyHasCount,
        total: snapshot.size
      });
    } catch (error) {
      logger.error('Error updating questions', { error: error.message });
      res.status(500).json({
        error: 'Failed to update questions',
        message: error.message
      });
    }
  });
});
