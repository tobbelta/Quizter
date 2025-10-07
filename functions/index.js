/**
 * Cloud Functions-skelett f├╢r tipspromenadens backend-endpoints.
 */
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onTaskDispatched} = require("firebase-functions/v2/tasks");
const {defineString, defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const {CloudTasksClient} = require("@google-cloud/tasks");

// CORS-konfiguration f├╢r att till├Ñta routequest.se och andra dom├ñner
const cors = require("cors")({
  origin: [
    "https://routequest.se",
    "https://www.routequest.se",
    "https://geoquest2-7e45c.firebaseapp.com",
    "https://geoquest2-7e45c.web.app",
    "http://localhost:3000" // F├╢r lokal utveckling
  ],
  credentials: true
});

// Define Stripe secret key parameter
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
// Define AI API keys as secrets
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const openaiApiKey = defineSecret("OPENAI_API_KEY");
const geminiApiKey = defineSecret("GEMINI_API_KEY");

if (!admin.apps.length) {
  admin.initializeApp();
}

const REGION = "europe-west1";
const PROJECT_ID = "geoquest2-7e45c"; // Replace with your project ID

// The queue name will be determined dynamically based on the function name.

const runtimeDefaults = {
  region: REGION,
  memory: "512MB",
  timeoutSeconds: 60,
  secrets: [anthropicApiKey, openaiApiKey, geminiApiKey, stripeSecretKey]
};

const taskRuntimeDefaults = {
    ...runtimeDefaults,
    timeoutSeconds: 540, // Allow longer for background tasks
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

// Cloud Tasks client
const cloudTasksClient = new CloudTasksClient();

/**
 * Ensures that the Cloud Tasks queue exists before enqueuing work.
 * Creates the queue with sensible defaults if it is missing.
 * @param {string} queueName - The short name of the queue (without project/location).
 * @returns {Promise<string>} - Fully qualified queue path.
 */
async function ensureQueue(queueName) {
  const queuePath = cloudTasksClient.queuePath(PROJECT_ID, REGION, queueName);
  try {
    await cloudTasksClient.getQueue({name: queuePath});
  } catch (error) {
    if (error.code === 5) { // NOT_FOUND
      const parent = cloudTasksClient.locationPath(PROJECT_ID, REGION);
      await cloudTasksClient.createQueue({
        parent,
        queue: {
          name: queuePath,
          rateLimits: {maxDispatchesPerSecond: 5},
          retryConfig: {
            maxRetryDuration: {seconds: 3600},
          },
        },
      });
      logger.info(`Created Cloud Tasks queue ${queueName}.`);
    } else {
      throw error;
    }
  }
  return queuePath;
}

/**
 * Enqueues a task for background processing.
 * @param {string} taskType - The type of task to enqueue (e.g., 'generate', 'validate').
 * @param {object} payload - The data required for the task.
 * @param {string} userId - The ID of the user who initiated the task.
 * @returns {Promise<string>} The ID of the created background task document.
 */
async function enqueueTask(taskType, payload, userId) {
  const db = admin.firestore();
  const taskDocRef = db.collection('backgroundTasks').doc();
  const sanitizePayload = (data) => {
    if (Array.isArray(data)) {
      return data
        .filter((item) => item !== undefined)
        .map((item) => sanitizePayload(item));
    }

    if (data && typeof data === 'object') {
      return Object.entries(data).reduce((acc, [key, value]) => {
        if (value === undefined) {
          return acc;
        }
        acc[key] = sanitizePayload(value);
        return acc;
      }, {});
    }

    return data;
  };

  const sanitizedPayload = sanitizePayload(payload);

  const taskInfo = {
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'pending',
    taskType,
    userId,
    payload: sanitizedPayload,
  };
  await taskDocRef.set(taskInfo);

  const queueName = `runai${taskType}`;
  const queuePath = await ensureQueue(queueName);

  // Construct the URL to the handler function
  const url = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${queueName}`;

  const task = {
    httpRequest: {
      httpMethod: 'POST',
      url,
      body: Buffer.from(JSON.stringify({ taskId: taskDocRef.id, ...sanitizedPayload })).toString('base64'),
      headers: {
        'Content-Type': 'application/json',
      },
      // Add OIDC token to authenticate with the private Cloud Function
      oidcToken: {
        serviceAccountEmail: `geoquest2-7e45c@appspot.gserviceaccount.com`,
      },
    },
    scheduleTime: {
        seconds: Date.now() / 1000 + 2 // Schedule to run in 2 seconds
    }
  };

  try {
    const [response] = await cloudTasksClient.createTask({ parent: queuePath, task });
    logger.info(`Task ${response.name} enqueued to ${queueName}.`);
    await taskDocRef.update({ status: 'queued', cloudTaskName: response.name });
  } catch (error) {
    logger.error("Error enqueueing task", { error: error.message, taskId: taskDocRef.id });
    await taskDocRef.update({ status: 'failed', error: error.message });
    throw error; // Re-throw to be caught by the calling function
  }

  return taskDocRef.id;
}


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
  // TODO: Uppdatera deltagarens svar och po├ñng.
  if (!ensurePost(req, res)) {
    return;
  }

  logger.info("submitAnswer called", { participantId: req.body?.participantId });
  res.status(501).json({ error: "Not implemented" });
});

exports.closeRun = createHttpsHandler(async (req, res) => {
  // TODO: St├ñng rundan och skriv closedAt i Firestore.
  if (!ensurePost(req, res)) {
    return;
  }

  logger.info("closeRun called", { runId: req.body?.runId });
  res.status(501).json({ error: "Not implemented" });
});

/**
 * H├ñmta AI-status (krediter och tillg├ñnglighet f├╢r alla providers)
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

      // Testa Gemini - lista tillg├ñngliga modeller f├╢rst
      const geminiKey = geminiApiKey.value();
      if (geminiKey) {
        providers.gemini.configured = true;
        try {
          // Lista tillg├ñngliga modeller
          const listResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`
          );

          if (listResponse.ok) {
            const modelData = await listResponse.json();
            const availableModels = modelData.models || [];

            // Hitta f├╢rsta modellen som st├╢der generateContent
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

      // Best├ñm vilken provider som kommer anv├ñndas (prioritetsordning)
      let primaryProvider = null;
      let message = "Ingen AI-tj├ñnst konfigurerad";

      if (providers.anthropic.available) {
        primaryProvider = 'anthropic';
        message = `AI-generering tillg├ñnglig (Anthropic Claude)`;
      } else if (providers.openai.available) {
        primaryProvider = 'openai';
        message = `AI-generering tillg├ñnglig (OpenAI fallback)`;
      } else if (providers.gemini.available) {
        primaryProvider = 'gemini';
        message = `AI-generering tillg├ñnglig (Gemini fallback)`;
      } else if (providers.anthropic.configured || providers.openai.configured || providers.gemini.configured) {
        message = "Alla AI-tj├ñnster ej tillg├ñngliga - kontrollera API-nycklar";
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
 * Queue a task to generate questions with AI.
 */
exports.generateAIQuestions = createHttpsHandler(async (req, res) => {
    return cors(req, res, async () => {
        if (!ensurePost(req, res)) {
            return;
        }

        try {
            // Verify Firebase ID token
            const idToken = req.headers.authorization?.split('Bearer ')[1];
            if (!idToken) {
                return res.status(401).json({ error: "Unauthorized: No token provided" });
            }

            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const userId = decodedToken.uid;

            const { amount = 10, category, difficulty, provider = 'anthropic' } = req.body;

            if (amount < 1 || amount > 50) {
                return res.status(400).json({ error: "Amount must be between 1 and 50" });
            }

            const taskId = await enqueueTask('generation', { amount, category, difficulty, provider }, userId);

            res.status(202).json({
                success: true,
                message: "Question generation has been queued.",
                taskId: taskId
            });
        } catch (error) {
            logger.error("Error queueing AI question generation", { error: error.message, stack: error.stack });
            if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
                return res.status(401).json({ error: "Unauthorized: Invalid token" });
            }
            res.status(500).json({ error: "Failed to queue question generation task.", message: error.message });
        }
    });
});

/**
 * Queue a task to validate a question with AI.
 */
exports.validateQuestionWithAI = createHttpsHandler(async (req, res) => {
    return cors(req, res, async () => {
        if (!ensurePost(req, res)) {
            return;
        }

        try {
            // Verify Firebase ID token
            const idToken = req.headers.authorization?.split('Bearer ')[1];
            if (!idToken) {
                return res.status(401).json({ error: "Unauthorized: No token provided" });
            }

            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const userId = decodedToken.uid;

            const { question, options, correctOption, explanation } = req.body;

            if (!question || !options || correctOption === undefined || !explanation) {
                return res.status(400).json({ error: "Missing required fields: question, options, correctOption, explanation" });
            }
            if (!Array.isArray(options) || options.length !== 4) {
                return res.status(400).json({ error: "Options must be an array of 4 strings" });
            }

            const taskId = await enqueueTask('validation', { question, options, correctOption, explanation }, userId);

            res.status(202).json({
                success: true,
                message: "Question validation has been queued.",
                taskId: taskId
            });
        } catch (error) {
            logger.error("Error queueing AI question validation", { error: error.message, stack: error.stack });
            if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
                return res.status(401).json({ error: "Unauthorized: Invalid token" });
            }
            res.status(500).json({ error: "Failed to queue question validation task.", message: error.message });
        }
    });
});


// Schemalagd funktion som ska h├ñmta fler fr├Ñgor l├╢pande med AI.
// Anv├ñnder Anthropic som prim├ñr, OpenAI som andra fallback, Gemini som tredje fallback
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

      // F├╢rs├╢k med Anthropic f├╢rst
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
        // L├ñgg till createdAt om det inte finns
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
          title: 'Automatisk fr├Ñgegenerering slutf├╢rd',
          message: `${questions.length} nya fr├Ñgor har genererats med ${usedProvider === 'anthropic' ? 'Anthropic Claude' : usedProvider === 'openai' ? 'OpenAI' : 'Google Gemini'}`,
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
          title: 'Automatisk fr├Ñgegenerering misslyckades',
          message: `Kunde inte generera fr├Ñgor: ${error.message}`,
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
 * Task-dispatched function to run AI question generation.
 */
exports.runaigeneration = onTaskDispatched(taskRuntimeDefaults, async (req) => {
    const { taskId, amount, category, difficulty, provider } = req.body;
    const db = admin.firestore();
    const taskDocRef = db.collection('backgroundTasks').doc(taskId);

    try {
        await taskDocRef.update({ status: 'processing', startedAt: admin.firestore.FieldValue.serverTimestamp() });
        logger.info(`Processing AI generation task ${taskId}`, { amount, category, difficulty, provider });

        let questions = null;
        let usedProvider = null;

        if (provider === 'gemini') {
            const geminiKey = geminiApiKey.value();
            if (geminiKey) {
                const { generateQuestions: generateWithGemini } = require('./services/geminiQuestionGenerator');
                questions = await generateWithGemini({ amount, category, difficulty }, geminiKey);
                usedProvider = 'gemini';
            }
        } else if (provider === 'openai') {
            const openaiKey = openaiApiKey.value();
            if (openaiKey) {
                const { generateQuestions: generateWithOpenAI } = require('./services/openaiQuestionGenerator');
                questions = await generateWithOpenAI({ amount, category, difficulty }, openaiKey);
                usedProvider = 'openai';
            }
        } else {
            const anthropicKey = anthropicApiKey.value();
            if (anthropicKey) {
                const { generateQuestions: generateWithAnthropic } = require('./services/aiQuestionGenerator');
                questions = await generateWithAnthropic({ amount, category, difficulty }, anthropicKey);
                usedProvider = 'anthropic';
            }
        }

        if (!questions) {
            throw new Error(`Provider ${provider} failed or is not configured.`);
        }

        const batch = db.batch();
        questions.forEach(question => {
            const docRef = db.collection('questions').doc(question.id);
            const questionData = { ...question, createdAt: admin.firestore.FieldValue.serverTimestamp() };
            batch.set(docRef, questionData);
        });
        await batch.commit();

        const result = {
            count: questions.length,
            provider: usedProvider,
            questionIds: questions.map(q => q.id),
        };

        await taskDocRef.update({ status: 'completed', finishedAt: admin.firestore.FieldValue.serverTimestamp(), result });
        logger.info(`Successfully completed AI generation task ${taskId}`);

    } catch (error) {
        logger.error(`Failed AI generation task ${taskId}`, { error: error.message, stack: error.stack });
        await taskDocRef.update({ status: 'failed', finishedAt: admin.firestore.FieldValue.serverTimestamp(), error: error.message });
    }
});

/**
 * Task-dispatched function to run AI question validation.
 */
exports.runaivalidation = onTaskDispatched(taskRuntimeDefaults, async (req) => {
    const { taskId, question, options, correctOption, explanation } = req.body;
    const db = admin.firestore();
    const taskDocRef = db.collection('backgroundTasks').doc(taskId);

    try {
        await taskDocRef.update({ status: 'processing', startedAt: admin.firestore.FieldValue.serverTimestamp() });
        logger.info(`Processing AI validation task ${taskId}`);

        const validationResults = {};
        let allValid = true;
        const allIssues = [];
        let combinedReasoning = '';

        const anthropicKey = anthropicApiKey.value();
        if (anthropicKey) {
            try {
                const { validateQuestion } = require('./services/aiQuestionValidator');
                const result = await validateQuestion({ question, options, correctOption, explanation }, anthropicKey);
                validationResults.anthropic = result;
                if (!result.valid) {
                    allValid = false;
                    allIssues.push(...result.issues.map(issue => `[Anthropic] ${issue}`));
                }
                combinedReasoning += `**Anthropic:** ${result.reasoning}\n\n`;
            } catch (error) {
                logger.error("Anthropic validation failed during task", { error: error.message });
                validationResults.anthropic = { valid: false, error: error.message };
                allValid = false;
                allIssues.push(`[Anthropic] Validation Error: ${error.message}`);
            }
        }

        const geminiKey = geminiApiKey.value();
        if (geminiKey) {
            try {
                const { validateQuestion } = require('./services/geminiQuestionValidator');
                const result = await validateQuestion({ question, options, correctOption, explanation }, geminiKey);
                validationResults.gemini = result;
                if (!result.valid) {
                    allValid = false;
                    allIssues.push(...result.issues.map(issue => `[Gemini] ${issue}`));
                }
                combinedReasoning += `**Gemini:** ${result.reasoning}\n\n`;
            } catch (error) {
                logger.error("Gemini validation failed during task", { error: error.message });
                validationResults.gemini = { valid: false, error: error.message };
                allValid = false;
                allIssues.push(`[Gemini] Validation Error: ${error.message}`);
            }
        }

        if (!anthropicKey && !geminiKey) {
            throw new Error("No AI providers configured for validation.");
        }

        const finalResult = {
            valid: allValid,
            issues: allIssues,
            reasoning: combinedReasoning.trim(),
            providerResults: validationResults,
            providersChecked: Object.keys(validationResults).length
        };

        await taskDocRef.update({ status: 'completed', finishedAt: admin.firestore.FieldValue.serverTimestamp(), result: finalResult });
        logger.info(`Successfully completed AI validation task ${taskId}`);

    } catch (error) {
        logger.error(`Failed AI validation task ${taskId}`, { error: error.message, stack: error.stack });
        await taskDocRef.update({ status: 'failed', finishedAt: admin.firestore.FieldValue.serverTimestamp(), error: error.message });
    }
});


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
          error: "Amount must be between 100 and 100000 ├╢re (1-1000 kr)",
        });
        return;
      }

      // H├ñmta Stripe secret key fr├Ñn environment
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
        requestId: error?.requestId
      };

      logger.error("Error creating PaymentIntent", errorInfo);

      const isAuthError = error?.code === 'api_key_expired'
        || error?.code === 'authentication_error'
        || error?.type === 'StripeAuthenticationError'
        || error?.statusCode === 401;
      const isConnectionError = error?.code === 'api_connection_error'
        || error?.type === 'StripeAPIError'
        || error?.type === 'StripeConnectionError';
      const isRateLimited = error?.code === 'rate_limit_error'
        || error?.type === 'StripeRateLimitError'
        || error?.statusCode === 429;

      let status = 500;
      let errorCode = 'PAYMENT_INTENT_FAILED';
      let clientMessage = 'Failed to create payment';
      let retryable = true;

      if (isAuthError) {
        errorCode = 'STRIPE_AUTH_ERROR';
        clientMessage = 'Betalningssystemet behöver uppdateras. Kontakta administratören.';
        retryable = false;
      } else if (isConnectionError) {
        errorCode = 'STRIPE_UNAVAILABLE';
        clientMessage = 'Stripe svarar inte just nu. Försök igen om en liten stund.';
        status = 503;
      } else if (isRateLimited) {
        errorCode = 'STRIPE_RATE_LIMIT';
        clientMessage = 'För många betalningsförsök på kort tid. Vänta och prova igen.';
        status = 429;
      }

      const responsePayload = {
        error: clientMessage,
        errorCode,
        retryable
      };

      if (process.env.NODE_ENV !== 'production') {
        responsePayload.debug = {
          ...errorInfo,
          rawMessage: stripeMessage
        };
      }

      res.status(status).json(responsePayload);
    }
  });
});

/**
 * Stripe status health-check.
 * Returnerar kontoinformation och om nyckeln är giltig utan att skapa en betalning.
 */
exports.getStripeStatus = createHttpsHandler(async (req, res) => {
  return cors(req, res, async () => {
    if (req.method !== "GET") {
      res.set("Allow", "GET");
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    const secretKey = stripeSecretKey.value();
    if (!secretKey) {
      logger.error("Stripe secret key not configured for status check");
      res.status(500).json({
        success: false,
        error: "Payment system not configured",
        errorCode: "STRIPE_KEY_MISSING"
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
        payoutsEnabled: account.payouts_enabled
      });
    } catch (error) {
      const stripeMessage = error?.raw?.message || error?.message;

      const errorInfo = {
        message: stripeMessage,
        code: error?.code,
        type: error?.type,
        statusCode: error?.statusCode,
        requestId: error?.requestId
      };

      logger.error("Stripe status check failed", errorInfo);

      const isAuthError = error?.code === 'api_key_expired'
        || error?.code === 'authentication_error'
        || error?.type === 'StripeAuthenticationError'
        || error?.statusCode === 401;
      const isConnectionError = error?.code === 'api_connection_error'
        || error?.type === 'StripeAPIError'
        || error?.type === 'StripeConnectionError';
      const isRateLimited = error?.code === 'rate_limit_error'
        || error?.type === 'StripeRateLimitError'
        || error?.statusCode === 429;

      let status = 500;
      let errorCode = 'STRIPE_UNAVAILABLE';
      let clientMessage = 'Kunde inte nå Stripe just nu. Försök igen senare.';
      let retryable = true;

      if (isAuthError) {
        status = 500;
        errorCode = 'STRIPE_AUTH_ERROR';
        clientMessage = 'Stripe-nyckeln är ogiltig eller har gått ut.';
        retryable = false;
      } else if (isConnectionError) {
        status = 503;
        errorCode = 'STRIPE_UNAVAILABLE';
        clientMessage = 'Kunde inte nå Stripe just nu. Försök igen senare.';
      } else if (isRateLimited) {
        status = 429;
        errorCode = 'STRIPE_RATE_LIMIT';
        clientMessage = 'Stripe begränsar förfrågningarna just nu. Vänta och försök igen.';
      }

      const payload = {
        success: false,
        error: clientMessage,
        errorCode,
        retryable
      };

      if (process.env.NODE_ENV !== 'production') {
        payload.debug = {
          ...errorInfo,
          rawMessage: stripeMessage
        };
      }

      res.status(status).json(payload);
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
