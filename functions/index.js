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
const {prepareQuestionsForImport, loadExistingQuestions} = require("./services/questionImportService");
const {categorizeQuestion: categorizeWithAnthropic} = require('./services/aiQuestionCategorizer');
const {generateEmoji: generateEmojiWithAnthropic} = require('./services/aiEmojiGenerator.js');
const {categorizeQuestion: categorizeWithOpenAI} = require('./services/openaiQuestionCategorizer');
const {generateEmoji: generateEmojiWithOpenAI} = require('./services/openaiEmojiGenerator.js');
const {categorizeQuestion: categorizeWithGemini} = require('./services/geminiQuestionCategorizer');
const {generateEmoji: generateEmojiWithGemini} = require('./services/geminiEmojiGenerator.js');
const { validateQuestion: validateQuestionStructure } = require('./services/questionValidationService');

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

  // Generate appropriate label and description based on taskType
  const getTaskLabels = (type, payload) => {
    switch(type) {
      case 'generation':
        return {
          label: 'AI-generering',
          description: `Genererar ${payload.numberOfQuestions || 0} frågor.`
        };
      case 'validation':
        return {
          label: 'AI-validering',
          description: 'Validerar fråga.'
        };
      case 'batchvalidation':
        return {
          label: 'Mass-validering',
          description: `Validerar ${payload.questionIds?.length || 0} frågor.`
        };
      case 'regenerateemoji':
        return {
          label: 'Emoji-regenerering',
          description: 'Genererar om emoji för fråga.'
        };
      case 'batchregenerateemojis':
        return {
          label: 'Mass-regenerering Emojis',
          description: `Genererar om emojis för ${payload.questionIds?.length || 0} frågor.`
        };
      case 'migration':
        return {
          label: 'Migration',
          description: 'Migrerar frågor till nytt schema.'
        };
      default:
        return {
          label: 'Bakgrundsjobb',
          description: 'Kör bakgrundsjobb.'
        };
    }
  };

  const { label, description } = getTaskLabels(taskType, sanitizedPayload);

  const taskInfo = {
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'pending',
    taskType,
    label,
    description,
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
      body: Buffer.from(JSON.stringify({ data: { taskId: taskDocRef.id, ...sanitizedPayload } })).toString('base64'),
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

const PROVIDER_STATUS_CACHE_MS = 60 * 1000;
let providerStatusCache = { timestamp: 0, value: null };
let providerStatusPromise = null;

async function evaluateProviderStatus() {
  const providers = {
    anthropic: { configured: false, available: false },
    openai: { configured: false, available: false },
    gemini: { configured: false, available: false },
  };

  const anthropicKey = anthropicApiKey.value();
  if (anthropicKey) {
    providers.anthropic.configured = true;
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: anthropicKey });

      await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });

      providers.anthropic.available = true;
      providers.anthropic.model = 'claude-3-5-haiku-20241022';
    } catch (error) {
      logger.warn("Anthropic unavailable", { error: error.message });
      providers.anthropic.error = error.message;
      if (error.status) {
        providers.anthropic.errorStatus = error.status;
      }
    }
  }

  const openaiKey = openaiApiKey.value();
  if (openaiKey) {
    providers.openai.configured = true;
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: openaiKey });

      await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      });

      providers.openai.available = true;
      providers.openai.model = 'gpt-4o-mini';
    } catch (error) {
      logger.warn("OpenAI unavailable", { error: error.message });
      providers.openai.error = error.message;
    }
  }

  const geminiKey = geminiApiKey.value();
  if (geminiKey) {
    providers.gemini.configured = true;
    try {
      const listResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
      );

      if (listResponse.ok) {
        const modelData = await listResponse.json();
        const availableModels = modelData.models || [];

        const compatibleModel = availableModels.find((model) =>
          model.supportedGenerationMethods?.includes('generateContent'),
        );

        if (compatibleModel) {
          providers.gemini.available = true;
          providers.gemini.model = compatibleModel.name.replace('models/', '');
          providers.gemini.availableModels = availableModels.map((model) => model.name);
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

  let primaryProvider = null;
  let message = "Ingen AI-tjänst konfigurerad";

  if (providers.anthropic.available) {
    primaryProvider = 'anthropic';
    message = 'AI-generering tillgänglig (Anthropic Claude)';
  } else if (providers.openai.available) {
    primaryProvider = 'openai';
    message = 'AI-generering tillgänglig (OpenAI fallback)';
  } else if (providers.gemini.available) {
    primaryProvider = 'gemini';
    message = 'AI-generering tillgänglig (Gemini fallback)';
  } else if (
    providers.anthropic.configured ||
    providers.openai.configured ||
    providers.gemini.configured
  ) {
    message = 'Alla AI-tjänster ej tillgängliga - kontrollera API-nycklar';
  }

  return { providers, primaryProvider, message };
}

async function getProviderStatus({ force = false } = {}) {
  const now = Date.now();

  if (!force && providerStatusCache.value && (now - providerStatusCache.timestamp) < PROVIDER_STATUS_CACHE_MS) {
    return providerStatusCache.value;
  }

  if (providerStatusPromise) {
    return providerStatusPromise;
  }

  providerStatusPromise = evaluateProviderStatus()
    .then((status) => {
      providerStatusCache = { timestamp: Date.now(), value: status };
      return status;
    })
    .catch((error) => {
      providerStatusCache = { timestamp: 0, value: null };
      throw error;
    });

  try {
    return await providerStatusPromise;
  } finally {
    providerStatusPromise = null;
  }
}

/**
 * H├ñmta AI-status (krediter och tillg├ñnglighet f├╢r alla providers)
 */
exports.getAIStatus = createHttpsHandler(async (req, res) => {
  return cors(req, res, async () => {
    try {
      const { providers, primaryProvider, message } = await getProviderStatus({ force: true });

      res.status(200).json({
        available: primaryProvider !== null,
        primaryProvider,
        providers,
        message,
      });
    } catch (error) {
      logger.error("Error checking AI status", { error: error.message });
      res.status(500).json({
        available: false,
        error: error.message,
        message: "Kunde inte kontrollera AI-status",
      });
    }
  });
});

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

            const { amount = 10, category, ageGroup, provider = 'anthropic' } = req.body;

            if (amount < 1 || amount > 50) {
                return res.status(400).json({ error: "Amount must be between 1 and 50" });
            }

            const taskId = await enqueueTask('generation', { amount, category, ageGroup, provider }, userId);

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

/**
 * Get AI provider settings
 */
exports.getProviderSettings = createHttpsHandler(async (req, res) => {
    return cors(req, res, async () => {
        try {
            const db = admin.firestore();
            const settingsDoc = await db.collection('aiProviderSettings').doc('config').get();

            const defaultSettings = {
                generation: { anthropic: true,
                    openai: true,
                    gemini: true
                },
                validation: {
                    anthropic: true,
                    openai: true,
                    gemini: true
                },
                migration: {
                    anthropic: true,
                    openai: false,
                    gemini: false
                },
                illustration: {
                    anthropic: true,
                    openai: true,
                    gemini: true
                }
            };

            if (!settingsDoc.exists) {
                // Return default settings
                res.status(200).json({
                    settings: defaultSettings,
                    message: 'Using default settings'
                });
            } else {
                res.status(200).json({
                    settings: settingsDoc.data(),
                    message: 'Settings loaded successfully'
                });
            }
        } catch (error) {
            logger.error("Error getting provider settings", { error: error.message });
            res.status(500).json({ error: "Failed to get provider settings", message: error.message });
        }
    });
});

/**
 * Update AI provider settings
 */
exports.updateProviderSettings = createHttpsHandler(async (req, res) => {
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

            // Verify user is superuser (you might want to add a custom claim check here)
            // For now, we just check they're authenticated

            const { settings } = req.body;

            if (!settings || typeof settings !== 'object') {
                return res.status(400).json({ error: "Invalid settings object" });
            }

            // Validate structure
            const validPurposes = ['generation', 'validation', 'migration'];
            const validProviders = ['anthropic', 'openai', 'gemini'];

            for (const purpose of validPurposes) {
                if (!settings[purpose]) {
                    return res.status(400).json({ error: `Missing settings for ${purpose}` });
                }
                for (const provider of validProviders) {
                    if (typeof settings[purpose][provider] !== 'boolean') {
                        return res.status(400).json({ error: `Invalid value for ${purpose}.${provider}` });
                    }
                }
            }

            const db = admin.firestore();
            await db.collection('aiProviderSettings').doc('config').set({
                ...settings,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedBy: decodedToken.uid
            });

            logger.info('Provider settings updated', { userId: decodedToken.uid });

            res.status(200).json({
                success: true,
                message: "Provider settings updated successfully"
            });
        } catch (error) {
            logger.error("Error updating provider settings", { error: error.message, stack: error.stack });
            if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
                return res.status(401).json({ error: "Unauthorized: Invalid token" });
            }
            res.status(500).json({ error: "Failed to update provider settings", message: error.message });
        }
    });
});

/**
 * Regenerate emoji illustration for a single question using configured providers.
 */
exports.regenerateQuestionEmoji = createHttpsHandler(async (req, res) => {
    return cors(req, res, async () => {
        if (!ensurePost(req, res)) {
            return;
        }

        try {
            const idToken = req.headers.authorization?.split('Bearer ')[1];
            if (!idToken) {
                return res.status(401).json({ error: "Unauthorized: No token provided" });
            }

            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const { questionId, provider } = req.body || {};

            if (!questionId) {
                return res.status(400).json({ error: "questionId is required" });
            }

            const db = admin.firestore();
            const questionRef = db.collection('questions').doc(questionId);
            const questionSnap = await questionRef.get();

            if (!questionSnap.exists) {
                return res.status(404).json({ error: "Question not found" });
            }

            const questionData = questionSnap.data();

            const toArray = (value) => {
                if (Array.isArray(value)) {
                    return value;
                }
                if (value && typeof value === 'object') {
                    return Object.values(value);
                }
                if (typeof value === 'string' && value.trim().length > 0) {
                    return [value];
                }
                return [];
            };

            const questionTextRaw =
                questionData.languages?.sv?.text ??
                questionData.question?.sv ??
                questionData.question ??
                questionData.text ??
                questionData.languages?.en?.text ??
                '';

            const questionText = typeof questionTextRaw === 'string' && questionTextRaw.trim().length > 0
                ? questionTextRaw
                : 'Okänd fråga från tidigare import';

            const rawOptions =
                questionData.languages?.sv?.options ??
                questionData.options?.sv ??
                questionData.options ??
                questionData.languages?.en?.options ??
                [];

            const normalizedOptions = toArray(rawOptions)
                .map((option) => (typeof option === 'string' ? option : String(option ?? '')))
                .filter((option) => option.trim().length > 0);

            const explanationText =
                questionData.languages?.sv?.explanation ??
                questionData.explanation?.sv ??
                questionData.explanation ??
                questionData.languages?.en?.explanation ??
                '';

            const questionPayload = {
                question: questionText,
                options: normalizedOptions,
                explanation: explanationText
            };

            const providers = await getProvidersForPurpose('illustration');
            if (providers.length === 0) {
                return res.status(500).json({
                    error: 'No illustration providers are enabled and configured'
                });
            }

            let preferredProvider = null;
            if (provider) {
                preferredProvider = providers.find((p) => p.name === provider);
            }

            const emojiOutcome = await runEmojiGenerationWithProviders(
                questionPayload,
                providers,
                questionId,
                preferredProvider
            );

            if (!emojiOutcome) {
                return res.status(500).json({
                    error: 'Failed to generate illustration with available providers'
                });
            }

            const updateData = {
                illustration: emojiOutcome.emoji,
                illustrationProvider: emojiOutcome.provider.name,
                illustrationGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
                migrationSvgProvider: emojiOutcome.provider.name,
                migrationSvgUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            await questionRef.update(updateData);

            logger.info('Regenerated illustration for question', {
                questionId,
                provider: emojiOutcome.provider.name,
                requestedProvider: provider || 'auto',
                userId: decodedToken.uid,
            });

            res.status(200).json({
                success: true,
                questionId,
                provider: emojiOutcome.provider.name,
                emoji: emojiOutcome.emoji,
            });
        } catch (error) {
            logger.error('Error regenerating illustration', { error: error.message, stack: error.stack });
            res.status(500).json({ error: "Failed to regenerate illustration", message: error.message });
        }
    });
});

exports.regenerateAllIllustrations = createHttpsHandler(async (req, res) => {
    return cors(req, res, async () => {
        if (!ensurePost(req, res)) {
            return;
        }

        try {
            const idToken = req.headers.authorization?.split('Bearer ')[1];
            if (!idToken) {
                return res.status(401).json({ error: "Unauthorized: No token provided" });
            }

            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const userId = decodedToken.uid;

            const taskId = await enqueueTask('emojiregeneration', {}, userId);

            res.status(202).json({
                success: true,
                message: "Illustration regeneration has been queued.",
                taskId: taskId
            });
        } catch (error) {
            logger.error("Error queueing illustration regeneration", { error: error.message, stack: error.stack });
            if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
                return res.status(401).json({ error: "Unauthorized: Invalid token" });
            }
            res.status(500).json({ error: "Failed to queue illustration regeneration task.", message: error.message });
        }
    });
});

/**
 * Queue a task to migrate questions to new schema with AI categorization.
 */
exports.queueMigration = createHttpsHandler(async (req, res) => {
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

            const taskId = await enqueueTask('migration', {}, userId);

            res.status(202).json({
                success: true,
                message: "Question migration has been queued.",
                taskId: taskId
            });
        } catch (error) {
            logger.error("Error queueing AI question migration", { error: error.message, stack: error.stack });
            if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
                return res.status(401).json({ error: "Unauthorized: Invalid token" });
            }
            res.status(500).json({ error: "Failed to queue question migration task.", message: error.message });
        }
    });
});


/**
 * Hämtar provider settings från Firestore
 * @returns {Promise<object>} Provider settings
 */
async function getProviderSettings() {
  try {
    const db = admin.firestore();
    const settingsDoc = await db.collection('aiProviderSettings').doc('config').get();

    const defaultSettings = {
      generation: { anthropic: true, openai: true, gemini: true },
      validation: { anthropic: true, openai: true, gemini: true },
      migration: { anthropic: true, openai: false, gemini: false },
      illustration: { anthropic: true, openai: true, gemini: true }
    };

    return settingsDoc.exists ? settingsDoc.data() : defaultSettings;
  } catch (error) {
    logger.warn('Failed to load provider settings, using defaults', { error: error.message });
    return {
      generation: { anthropic: true, openai: true, gemini: true },
      validation: { anthropic: true, openai: true, gemini: true },
      migration: { anthropic: true, openai: false, gemini: false },
      illustration: { anthropic: true, openai: true, gemini: true }
    };
  }
}

async function getProvidersForPurpose(purpose = 'generation') {
  const settings = await getProviderSettings();
  const purposeSettings = settings[purpose] || settings.generation || {};
  const providers = [];
  const status = await getProviderStatus();
  const providerStates = (status && status.providers) || {};
  const requireAvailability = purpose === 'migration';

  const isProviderActive = (name) => {
    const state = providerStates[name];
    if (!state) {
      return !requireAvailability;
    }
    if (!state.configured) {
      return false;
    }
    if (requireAvailability) {
      return state.available === true;
    }
    return state.available !== false;
  };

  const anthropicKey = anthropicApiKey.value();
  if (anthropicKey && purposeSettings.anthropic !== false && isProviderActive('anthropic')) {
    const provider = {
      name: 'anthropic',
      key: anthropicKey,
    };
    if (purpose === 'generation') {
      provider.generator = require('./services/aiQuestionGenerator').generateQuestions;
    }
    if (purpose === 'migration') {
      provider.categorize = (payload) => categorizeWithAnthropic(payload, anthropicKey);
      provider.generateEmoji = (payload) => generateEmojiWithAnthropic(payload, anthropicKey);
    }
    if (purpose === 'illustration') {
      provider.generateEmoji = (payload) => generateEmojiWithAnthropic(payload, anthropicKey);
    }
    providers.push(provider);
  }

  const openaiKey = openaiApiKey.value();
  if (openaiKey && purposeSettings.openai !== false && isProviderActive('openai')) {
    const provider = {
      name: 'openai',
      key: openaiKey,
    };
    if (purpose === 'generation') {
      provider.generator = require('./services/openaiQuestionGenerator').generateQuestions;
    }
    if (purpose === 'migration') {
      provider.categorize = (payload) => categorizeWithOpenAI(payload, openaiKey);
      provider.generateEmoji = (payload) => generateEmojiWithOpenAI(payload, openaiKey);
    }
    if (purpose === 'illustration') {
      provider.generateEmoji = (payload) => generateEmojiWithOpenAI(payload, openaiKey);
    }
    providers.push(provider);
  }

  const geminiKey = geminiApiKey.value();
  if (geminiKey && purposeSettings.gemini !== false && isProviderActive('gemini')) {
    const provider = {
      name: 'gemini',
      key: geminiKey,
    };
    if (purpose === 'generation') {
      provider.generator = require('./services/geminiQuestionGenerator').generateQuestions;
    }
    if (purpose === 'migration') {
      provider.categorize = (payload) => categorizeWithGemini(payload, geminiKey);
      provider.generateEmoji = (payload) => generateEmojiWithGemini(payload, geminiKey);
    }
    if (purpose === 'illustration') {
      provider.generateEmoji = (payload) => generateEmojiWithGemini(payload, geminiKey);
    }
    providers.push(provider);
  }

  return providers;
}

/**
 * Hjälpfunktion för att slumpmässigt välja en tillgänglig AI-provider
 * @param {string} purpose - Ändamål: 'generation', 'validation', 'migration'
 * @returns {Promise<object|null>}
 */
async function selectRandomProvider(purpose = 'generation') {
  const providers = await getProvidersForPurpose(purpose);
  if (providers.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * providers.length);
  return providers[randomIndex];
}

function shuffleArray(items) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function runCategorizationWithProviders(questionPayload, providers, docId) {
  const order = shuffleArray(
    providers.filter((provider) => typeof provider.categorize === 'function'),
  );

  for (const provider of order) {
    try {
      const result = await provider.categorize(questionPayload);
      return { result, provider };
    } catch (error) {
      logger.warn(`Categorization failed for provider ${provider.name}`, {
        questionId: docId,
        error: error.message,
      });
    }
  }

  return null;
}

async function runEmojiGenerationWithProviders(questionPayload, providers, docId, preferredProvider) {
  const availableProviders = providers.filter((provider) => typeof provider.generateEmoji === 'function');
  if (availableProviders.length === 0) {
    return null;
  }

  const remaining = preferredProvider
    ? availableProviders.filter((provider) => provider.name !== preferredProvider.name)
    : availableProviders;

  const order = preferredProvider
    ? [preferredProvider, ...shuffleArray(remaining)]
    : shuffleArray(availableProviders);

  for (const provider of order) {
    try {
      const emoji = await provider.generateEmoji(questionPayload);
      return { emoji, provider };
    } catch (error) {
      logger.warn(`Emoji generation failed for provider ${provider.name}`, {
        questionId: docId,
        error: error.message,
      });
    }
  }

  return null;
}

// Schemalagd funktion som ska h├ñmta fler fr├Ñgor l├╢pande med AI.
// Använder slumpmässig provider-val för varje batch av frågor
exports.questionImport = onSchedule(
  {
    schedule: "every 6 hours",
    region: REGION,
    secrets: [anthropicApiKey, openaiApiKey, geminiApiKey]
  },
  async (event) => {
    logger.info("questionImport trigger executed", { timestamp: event.scheduleTime });

    try {
      const allQuestions = [];
      const providerUsage = { anthropic: 0, openai: 0, gemini: 0 };
      const totalQuestionsToGenerate = 20;
      const questionsPerBatch = 5; // Generera 5 frågor per batch för bättre blandning
      const batches = Math.ceil(totalQuestionsToGenerate / questionsPerBatch);

      for (let i = 0; i < batches; i++) {
        const provider = await selectRandomProvider('generation');

        if (!provider) {
          logger.warn("No AI providers enabled for generation, skipping automatic question import");
          return;
        }

        try {
          const questions = await provider.generator({ amount: questionsPerBatch }, provider.key);
          if (questions && questions.length > 0) {
            allQuestions.push(...questions);
            providerUsage[provider.name] += questions.length;
            logger.info(`Batch ${i + 1}/${batches}: Generated ${questions.length} questions with ${provider.name}`);
          }
        } catch (error) {
          logger.warn(`Failed to generate with ${provider.name} in batch ${i + 1}`, {
            error: error.message
          });
          // Fortsätt med nästa batch även om en misslyckas
        }
      }

      if (allQuestions.length === 0) {
        logger.warn('No questions generated from any provider');
        return;
      }

      const questions = allQuestions;
      const usedProvider = 'mixed'; // Flera providers användes

      // Spara till Firestore
      const db = admin.firestore();
      const existingQuestions = await loadExistingQuestions(db);
      const {questionsToImport, stats} = prepareQuestionsForImport(questions, existingQuestions);

      if (questionsToImport.length === 0) {
        logger.warn('No questions imported efter validering/dublettkontroll', {
          provider: usedProvider,
          totalIncoming: stats.totalIncoming,
          duplicatesBlocked: stats.duplicatesBlocked,
          invalidCount: stats.invalidCount,
        });
        return;
      }

      const batch = db.batch();

      questionsToImport.forEach((question) => {
        const docRef = db.collection('questions').doc(question.id);
        const questionData = {
          ...question,
          createdAt: question.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        };
        batch.set(docRef, questionData);
      });

      await batch.commit();

      logger.info('Successfully imported AI-generated questions', {
        count: questionsToImport.length,
        provider: usedProvider,
        providerUsage,
        timestamp: event.scheduleTime,
        validation: stats,
      });

      // Köa AI-validering av de importerade frågorna (asynkront)
      try {
        const questionsForValidation = questionsToImport.map(q => ({
          id: q.id,
          question: q.languages?.sv?.text || q.question?.sv || '',
          options: q.languages?.sv?.options || q.options?.sv || [],
          correctOption: q.correctOption || 0,
          explanation: q.languages?.sv?.explanation || q.explanation?.sv || ''
        }));

        if (questionsForValidation.length > 0) {
          const taskId = await enqueueTask('batchvalidation', {
            questions: questionsForValidation
          }, 'system');

          logger.info(`Queued AI validation for ${questionsForValidation.length} imported questions`, {
            taskId,
            count: questionsForValidation.length
          });
        }
      } catch (validationError) {
        logger.warn('Failed to queue AI validation for imported questions', {
          error: validationError.message
        });
        // Continue even if validation queueing fails
      }

      // Skapa notis till superusers
      try {
        const notificationRef = db.collection('notifications').doc();

        // Bygg meddelande baserat på provider-användning
        let providerMessage = '';
        if (usedProvider === 'mixed') {
          const usedProviders = Object.entries(providerUsage)
            .filter(([, count]) => count > 0)
            .map(([name, count]) => `${name.charAt(0).toUpperCase() + name.slice(1)} (${count})`)
            .join(', ');
          providerMessage = `blandade providers: ${usedProviders}`;
        } else {
          providerMessage = usedProvider === 'anthropic' ? 'Anthropic Claude' : usedProvider === 'openai' ? 'OpenAI' : 'Google Gemini';
        }

        await notificationRef.set({
          type: 'question_import',
          title: 'Automatisk frågegenerering slutförd',
          message: `${questionsToImport.length} nya frågor har genererats med ${providerMessage}`,
          data: {
            count: questionsToImport.length,
            provider: usedProvider,
            providerUsage,
            model: questionsToImport[0]?.source || 'ai-generated',
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
    const { taskId, amount, category, ageGroup, provider } = req.data;
    const db = admin.firestore();
    const taskDocRef = db.collection('backgroundTasks').doc(taskId);

    const safeUpdateProgress = async ({ phase = '', completed = 0, total = 0, details = '' }) => {
        try {
            await db.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(taskDocRef);
                if (!snapshot.exists) {
                    throw new Error(`Task ${taskId} not found during progress update`);
                }

                const data = snapshot.data() || {};
                const status = data.status;
                if (['cancelled', 'failed'].includes(status)) {
                    return;
                }

                const nextProgress = {
                    phase,
                    completed: Math.max(0, completed),
                    total: Math.max(0, total),
                    details,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };

                transaction.update(taskDocRef, { progress: nextProgress });
            });
        } catch (progressError) {
            logger.warn(`Failed to update progress for generation task ${taskId}`, { error: progressError.message });
        }
    };

    try {
        await taskDocRef.update({
            status: 'processing',
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            progress: {
                phase: 'Initierar',
                completed: 0,
                total: amount,
                details: 'Förbereder AI-generering...',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        });
        logger.info(`Processing AI generation task ${taskId}`, { amount, category, ageGroup, provider });

        let questions = null;
        let usedProvider = null;
        const anthropicKey = anthropicApiKey.value();

        // Om provider är 'random', slumpa fram en provider
        if (provider === 'random') {
            const randomProvider = await selectRandomProvider('generation');
            if (!randomProvider) {
                throw new Error('No AI providers are enabled for generation');
            }
            await safeUpdateProgress({
                phase: 'Genererar frågor',
                completed: 0,
                total: amount,
                details: `Använder ${randomProvider.name}...`
            });
            questions = await randomProvider.generator({ amount, category, ageGroup }, randomProvider.key);
            usedProvider = randomProvider.name;
        } else if (provider === 'gemini') {
            const geminiKey = geminiApiKey.value();
            if (geminiKey) {
                await safeUpdateProgress({
                    phase: 'Genererar frågor',
                    completed: 0,
                    total: amount,
                    details: 'Använder Gemini...'
                });
                const { generateQuestions: generateWithGemini } = require('./services/geminiQuestionGenerator');
                questions = await generateWithGemini({ amount, category, ageGroup }, geminiKey);
                usedProvider = 'gemini';
            }
        } else if (provider === 'openai') {
            const openaiKey = openaiApiKey.value();
            if (openaiKey) {
                await safeUpdateProgress({
                    phase: 'Genererar frågor',
                    completed: 0,
                    total: amount,
                    details: 'Använder OpenAI...'
                });
                const { generateQuestions: generateWithOpenAI } = require('./services/openaiQuestionGenerator');
                questions = await generateWithOpenAI({ amount, category, ageGroup }, openaiKey);
                usedProvider = 'openai';
            }
        } else if (anthropicKey) {
            await safeUpdateProgress({
                phase: 'Genererar frågor',
                completed: 0,
                total: amount,
                details: 'Använder Anthropic...'
            });
            const { generateQuestions: generateWithAnthropic } = require('./services/aiQuestionGenerator');
            questions = await generateWithAnthropic({ amount, category, ageGroup }, anthropicKey);
            usedProvider = 'anthropic';
        }

        if (!questions) {
            throw new Error(`Provider ${provider} failed or is not configured.`);
        }

        await safeUpdateProgress({
            phase: 'Validerar frågor',
            completed: questions.length,
            total: amount,
            details: `${questions.length} frågor genererade, kontrollerar dubletter...`
        });

        const existingQuestions = await loadExistingQuestions(db);
        const {questionsToImport, stats} = prepareQuestionsForImport(questions, existingQuestions);

        if (questionsToImport.length === 0) {
            throw new Error('No new questions passed validation/dublettkontroll.');
        }

        // Generera Emoji-illustrationer för frågorna med konfigurerade providers
        const illustrationProviders = await getProvidersForPurpose('illustration');
        const canGenerateEmoji = illustrationProviders.length > 0;

        await safeUpdateProgress({
            phase: 'Genererar illustrationer',
            completed: canGenerateEmoji ? 0 : questionsToImport.length,
            total: questionsToImport.length,
            details: canGenerateEmoji
                ? 'Skapar Emoji-illustrationer med AI...'
                : 'Inga illustration-providers aktiverade - hoppar över Emoji-generering'
        });

        let emojiGeneratedCount = 0;
        let emojiFailedCount = 0;
        let emojiSkippedCount = 0;

        if (!canGenerateEmoji) {
            emojiSkippedCount = questionsToImport.length;
            logger.warn('Skipping Emoji generation for AI questions - no illustration providers available');
        } else {
            for (const question of questionsToImport) {
                const questionPayload = {
                    question: question.languages?.sv?.text || question.question?.sv || question.question,
                    options: question.languages?.sv?.options || question.options?.sv || question.options || [],
                    explanation: question.languages?.sv?.explanation || question.explanation?.sv || question.explanation
                };

                const emojiOutcome = await runEmojiGenerationWithProviders(
                    questionPayload,
                    illustrationProviders,
                    question.id,
                    null
                );

                if (emojiOutcome) {
                    question.illustration = emojiOutcome.emoji;
                    question.illustrationGeneratedAt = admin.firestore.FieldValue.serverTimestamp();
                    question.illustrationProvider = emojiOutcome.provider.name;
                    emojiGeneratedCount++;
                } else {
                    emojiFailedCount++;
                    logger.warn(`Failed to generate Emoji for question ${question.id}`);
                }

                await safeUpdateProgress({
                    phase: 'Genererar illustrationer',
                    completed: emojiGeneratedCount + emojiFailedCount,
                    total: questionsToImport.length,
                    details: `${emojiGeneratedCount} illustrationer skapade, ${emojiFailedCount} misslyckades`
                });
            }
        }

        // Uppdatera progress med dublett-information
        const duplicateInfo = stats.duplicatesBlocked > 0
            ? ` (${stats.duplicatesBlocked} dubletter blockerade)`
            : '';

        await safeUpdateProgress({
            phase: 'Sparar frågor',
            completed: questionsToImport.length,
            total: amount,
            details: `Sparar ${questionsToImport.length} frågor till databasen${duplicateInfo}...`
        });

        const batch = db.batch();
        questionsToImport.forEach((question) => {
            const docRef = db.collection('questions').doc(question.id);
            const questionData = { ...question, createdAt: admin.firestore.FieldValue.serverTimestamp() };
            batch.set(docRef, questionData);
        });
        await batch.commit();

        logger.info('Queued AI generation import summary', {
            taskId,
            provider: usedProvider,
            totalIncoming: stats.totalIncoming,
            duplicatesBlocked: stats.duplicatesBlocked,
            invalidCount: stats.invalidCount,
            imported: questionsToImport.length,
            emojiGenerated: emojiGeneratedCount,
            emojiFailed: emojiFailedCount,
            emojiSkipped: emojiSkippedCount,
        });

        const result = {
            count: questionsToImport.length,
            provider: usedProvider,
            questionIds: questionsToImport.map(q => q.id),
            validation: stats,
            emoji: {
                generated: emojiGeneratedCount,
                failed: emojiFailedCount,
                skipped: emojiSkippedCount
            },
            details: {
                requested: amount,
                generated: questions.length,
                imported: questionsToImport.length,
                duplicatesBlocked: stats.duplicatesBlocked,
                invalidCount: stats.invalidCount,
                category: category || 'Alla',
                ageGroup: ageGroup || 'Blandad',
                emojiGenerated: emojiGeneratedCount,
                emojiFailed: emojiFailedCount,
                emojiSkipped: emojiSkippedCount
            }
        };

        // Bygg slutmeddel ande med eventuell dublett-information
        let finalDetails = stats.duplicatesBlocked > 0
            ? `${questionsToImport.length} frågor importerade (${stats.duplicatesBlocked} dubletter blockerade)`
            : `${questionsToImport.length} frågor importerade`;
        if (emojiSkippedCount > 0) {
            finalDetails += ' (Emoji-generering hoppades över)';
        } else if (emojiFailedCount > 0) {
            finalDetails += ` (${emojiFailedCount} illustrationer misslyckades)`;
        }

        await taskDocRef.update({
            status: 'completed',
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            result,
            progress: {
                phase: 'Klar',
                completed: questionsToImport.length,
                total: amount,
                details: finalDetails,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        });
        logger.info(`Successfully completed AI generation task ${taskId}`);

    } catch (error) {
        logger.error(`Failed AI generation task ${taskId}`, { error: error.message, stack: error.stack });
        await taskDocRef.update({
            status: 'failed',
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: error.message,
            progress: {
                phase: 'Misslyckades',
                completed: 0,
                total: amount,
                details: error.message,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        });
    }
});

exports.runaiemojiregeneration = onTaskDispatched(taskRuntimeDefaults, async (req) => {
    const { taskId } = req.data;
    const db = admin.firestore();
    const taskDocRef = db.collection('backgroundTasks').doc(taskId);

    const safeUpdateProgress = async ({ phase = '', completed = 0, total = 0, details = '' }) => {
        try {
            await db.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(taskDocRef);
                if (!snapshot.exists) {
                    throw new Error(`Task ${taskId} not found during progress update`);
                }

                const data = snapshot.data() || {};
                const status = data.status;
                if (['cancelled', 'failed'].includes(status)) {
                    return;
                }

                const nextProgress = {
                    phase,
                    completed: Math.max(0, completed),
                    total: Math.max(0, total),
                    details,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };

                transaction.update(taskDocRef, { progress: nextProgress });
            });
        } catch (progressError) {
            logger.warn(`Failed to update progress for emoji regeneration task ${taskId}`, { error: progressError.message });
        }
    };

    try {
        await taskDocRef.update({
            status: 'processing',
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            progress: {
                phase: 'Initierar',
                completed: 0,
                total: 0,
                details: 'Förbereder regenerering av illustrationer...',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        });
        logger.info(`Processing illustration regeneration task ${taskId}`);

        const illustrationProviders = await getProvidersForPurpose('illustration');
        if (illustrationProviders.length === 0) {
            throw new Error('No illustration providers are enabled and configured');
        }

        const questionsRef = db.collection('questions');
        const snapshot = await questionsRef.get();

        if (snapshot.empty) {
            throw new Error('No questions found in Firestore');
        }

        await safeUpdateProgress({
            phase: 'Hämtar frågor',
            completed: 0,
            total: snapshot.size,
            details: `Hittade ${snapshot.size} frågor att uppdatera`
        });

        let generatedCount = 0;
        let failedCount = 0;
        let processedCount = 0;
        const updates = [];

        const toArray = (value) => {
            if (Array.isArray(value)) {
                return value;
            }
            if (value && typeof value === 'object') {
                return Object.values(value);
            }
            if (typeof value === 'string' && value.trim().length > 0) {
                return [value];
            }
            return [];
        };

        for (const doc of snapshot.docs) {
            const data = doc.data();

            const questionTextRaw =
                data.languages?.sv?.text ??
                data.question?.sv ??
                data.question ??
                data.text ??
                data.languages?.en?.text ??
                '';
            const questionText = typeof questionTextRaw === 'string' && questionTextRaw.trim().length > 0
                ? questionTextRaw
                : 'Okänd fråga från tidigare import';

            const rawOptions =
                data.languages?.sv?.options ??
                data.options?.sv ??
                data.options ??
                data.languages?.en?.options ??
                [];
            const normalizedOptions = toArray(rawOptions)
                .map((option) => (typeof option === 'string' ? option : String(option ?? '')))
                .filter((option) => option.trim().length > 0);

            const explanationText =
                data.languages?.sv?.explanation ??
                data.explanation?.sv ??
                data.explanation ??
                data.languages?.en?.explanation ??
                '';

            const questionPayload = {
                question: questionText,
                options: normalizedOptions,
                explanation: explanationText
            };

            const emojiOutcome = await runEmojiGenerationWithProviders(questionPayload, illustrationProviders, doc.id, null);

            if (emojiOutcome) {
                updates.push({
                    ref: doc.ref,
                    data: {
                        illustration: emojiOutcome.emoji,
                        illustrationProvider: emojiOutcome.provider.name,
                        illustrationGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
                    }
                });
                generatedCount++;
            } else {
                failedCount++;
                logger.warn('All illustration providers failed to generate emoji for question ' + doc.id);
            }

            processedCount++;
            await safeUpdateProgress({
                phase: 'Regenererar illustrationer',
                completed: processedCount,
                total: snapshot.size,
                details: `${generatedCount} illustrationer uppdaterade, ${failedCount} misslyckades`
            });
        }

        await safeUpdateProgress({
            phase: 'Sparar ändringar',
            completed: snapshot.size,
            total: snapshot.size,
            details: `Sparar ${updates.length} uppdateringar till databasen...`
        });

        let currentBatch = db.batch();
        let batchCount = 0;
        const batchOps = [];

        for (const update of updates) {
            currentBatch.update(update.ref, update.data);
            batchCount++;

            if (batchCount >= 400) {
                batchOps.push(currentBatch.commit());
                currentBatch = db.batch();
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            batchOps.push(currentBatch.commit());
        }

        await Promise.all(batchOps);

        const result = {
            generated: generatedCount,
            failed: failedCount,
            total: snapshot.size,
        };

        await taskDocRef.update({
            status: 'completed',
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            result,
            progress: {
                phase: 'Klar',
                completed: snapshot.size,
                total: snapshot.size,
                details: `${generatedCount} illustrationer uppdaterade, ${failedCount} misslyckades`,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        });
        logger.info(`Successfully completed illustration regeneration task ${taskId}`);

    } catch (error) {
        logger.error(`Failed illustration regeneration task ${taskId}`, { error: error.message, stack: error.stack });
        await taskDocRef.update({
            status: 'failed',
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: error.message,
            progress: {
                phase: 'Misslyckades',
                completed: 0,
                total: 0,
                details: error.message,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        });
    }
});

/**
 * Task-dispatched function to run AI question validation.
 */
exports.runaivalidation = onTaskDispatched(taskRuntimeDefaults, async (req) => {
    const { taskId, question, options, correctOption, explanation } = req.data;
    const db = admin.firestore();
    const taskDocRef = db.collection('backgroundTasks').doc(taskId);

    // Hämta provider settings
    const settings = await getProviderSettings();
    const validationSettings = settings.validation || { anthropic: true, openai: true, gemini: true };

    const anthropicKey = anthropicApiKey.value();
    const geminiKey = geminiApiKey.value();
    const openaiKey = openaiApiKey.value();
    const providerKeys = {
        anthropic: anthropicKey && validationSettings.anthropic !== false ? anthropicKey : null,
        gemini: geminiKey && validationSettings.gemini !== false ? geminiKey : null,
        openai: openaiKey && validationSettings.openai !== false ? openaiKey : null
    };
    const enabledProviders = Object.entries(providerKeys)
        .filter(([, key]) => Boolean(key))
        .map(([name]) => name);

    if (enabledProviders.length === 0) {
        await taskDocRef.update({
            status: 'failed',
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: 'AI-valideringen avbröts: inga AI-leverantörer är konfigurerade.'
        });
        logger.error(`AI validation task ${taskId} aborted: no AI providers configured.`);
        return;
    }

    try {
        await taskDocRef.update({ status: 'processing', startedAt: admin.firestore.FieldValue.serverTimestamp() });
        logger.info(`Processing AI validation task ${taskId}`);

        const providerHealth = Object.fromEntries(enabledProviders.map((name) => [name, 'unknown']));
        const formatProviderName = (provider) => provider.charAt(0).toUpperCase() + provider.slice(1);

        const validationResults = {};
        const reasoningSections = [];
        let suggestedCorrectOption;

        if (anthropicKey) {
            try {
                const { validateQuestion } = require('./services/aiQuestionValidator');
                const result = await validateQuestion({ question, options, correctOption, explanation }, anthropicKey);
                validationResults.anthropic = result;
                providerHealth.anthropic = 'healthy';
                if (typeof result.reasoning === 'string' && result.reasoning.trim()) {
                    reasoningSections.push(`**Anthropic:** ${result.reasoning}`);
                }
            } catch (error) {
                logger.error("Anthropic validation failed during task", { error: error.message });
                validationResults.anthropic = {
                    valid: null,
                    error: error.message,
                    unavailable: true
                };
                if (providerHealth.anthropic !== 'healthy') {
                    providerHealth.anthropic = 'unavailable';
                }
            }
        }

        if (geminiKey) {
            try {
                const { validateQuestion } = require('./services/geminiQuestionValidator');
                const result = await validateQuestion({ question, options, correctOption, explanation }, geminiKey);
                validationResults.gemini = result;
                providerHealth.gemini = 'healthy';
                if (typeof result.reasoning === 'string' && result.reasoning.trim()) {
                    reasoningSections.push(`**Gemini:** ${result.reasoning}`);
                }
            } catch (error) {
                logger.error("Gemini validation failed during task", { error: error.message });
                validationResults.gemini = {
                    valid: null,
                    error: error.message,
                    unavailable: true
                };
                if (providerHealth.gemini !== 'healthy') {
                    providerHealth.gemini = 'unavailable';
                }
            }
        }

        if (openaiKey) {
            try {
                const { validateQuestion } = require('./services/openaiQuestionValidator');
                const result = await validateQuestion({ question, options, correctOption, explanation }, openaiKey);
                validationResults.openai = result;
                providerHealth.openai = 'healthy';
                if (typeof result.reasoning === 'string' && result.reasoning.trim()) {
                    reasoningSections.push(`**OpenAI:** ${result.reasoning}`);
                }
            } catch (error) {
                logger.error("OpenAI validation failed during task", { error: error.message });
                validationResults.openai = {
                    valid: null,
                    error: error.message,
                    unavailable: true
                };
                if (providerHealth.openai !== 'healthy') {
                    providerHealth.openai = 'unavailable';
                }
            }
        }

        const successfulProviders = Object.entries(validationResults)
            .filter(([, result]) => typeof result?.valid === 'boolean');

        if (successfulProviders.length === 0) {
            if (enabledProviders.every((name) => providerHealth[name] === 'unavailable')) {
                throw new Error('AI-valideringen avbröts: inga AI-leverantörer är tillgängliga just nu.');
            }

            const providerErrors = Object.entries(validationResults)
                .filter(([, result]) => result?.error)
                .map(([providerName, result]) => `[${formatProviderName(providerName)}] ${result.error}`);

            const failureResult = {
                valid: false,
                issues: providerErrors.length > 0
                    ? providerErrors
                    : ['AI-valideringen kunde inte genomföras för frågan.'],
                reasoning: '',
                providerResults: validationResults,
                providersChecked: 0
            };

            await taskDocRef.update({
                status: 'failed',
                finishedAt: admin.firestore.FieldValue.serverTimestamp(),
                error: failureResult.issues.join(' | '),
                result: failureResult
            });
            return;
        }

        const invalidProviders = successfulProviders.filter(([, result]) => result.valid === false);
        const validProviders = successfulProviders.filter(([, result]) => result.valid === true);

        // Majoritetsbased konsensus: frågan är giltig om majoriteten säger ja
        const majorityValid = validProviders.length > invalidProviders.length;

        const issues = invalidProviders.flatMap(([providerName, result]) => {
            const providerLabel = formatProviderName(providerName);
            if (Array.isArray(result.issues) && result.issues.length > 0) {
                return result.issues.map((issue) => `[${providerLabel}] ${issue}`);
            }
            return [`[${providerLabel}] AI-valideringen rapporterade ett problem utan detaljer`];
        });

        if (invalidProviders.length > 0 && suggestedCorrectOption === undefined) {
            const suggested = invalidProviders
                .map(([, result]) => result.suggestedCorrectOption)
                .find((value) => value !== undefined);
            if (suggested !== undefined) {
                suggestedCorrectOption = suggested;
            }
        }

        const finalResult = {
            valid: majorityValid,
            consensus: {
                valid: validProviders.length,
                invalid: invalidProviders.length,
                total: successfulProviders.length,
                method: 'majority'
            },
            issues,
            reasoning: reasoningSections.join('\n\n').trim(),
            providerResults: validationResults,
            providersChecked: successfulProviders.length
        };

        if (suggestedCorrectOption !== undefined) {
            finalResult.suggestedCorrectOption = suggestedCorrectOption;
        }

        if (Object.values(validationResults).some((result) => result?.error && !result?.valid)) {
            finalResult.providerErrors = Object.entries(validationResults)
                .filter(([, result]) => result?.error)
                .map(([providerName, result]) => ({
                    provider: formatProviderName(providerName),
                    error: result.error
                }));
        }

        await taskDocRef.update({ status: 'completed', finishedAt: admin.firestore.FieldValue.serverTimestamp(), result: finalResult });
        logger.info(`Successfully completed AI validation task ${taskId}`);

    } catch (error) {
        logger.error(`Failed AI validation task ${taskId}`, { error: error.message, stack: error.stack });
        await taskDocRef.update({ status: 'failed', finishedAt: admin.firestore.FieldValue.serverTimestamp(), error: error.message });
    }
});

/**
 * Queue a task to validate multiple questions with AI (batch validation).
 */
exports.batchValidateQuestions = createHttpsHandler(async (req, res) => {
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

            const { questions } = req.body;

            if (!Array.isArray(questions) || questions.length === 0) {
                return res.status(400).json({ error: "questions must be a non-empty array" });
            }

            // Validate each question has required fields
            for (const q of questions) {
                if (!q.id || !q.question || !q.options || q.correctOption === undefined || !q.explanation) {
                    return res.status(400).json({
                        error: "Each question must have: id, question, options, correctOption, explanation"
                    });
                }
            }

            const taskId = await enqueueTask('batchvalidation', { questions }, userId);

            res.status(202).json({
                success: true,
                message: `Batch validation of ${questions.length} questions has been queued.`, 
                taskId: taskId,
                questionCount: questions.length
            });
        } catch (error) {
            logger.error("Error queueing batch question validation", { error: error.message, stack: error.stack });
            if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
                return res.status(401).json({ error: "Unauthorized: Invalid token" });
            }
            res.status(500).json({ error: "Failed to queue batch validation task.", message: error.message });
        }
    });
});

/**
 * Task-dispatched function to run batch AI question validation.
 */
exports.runaibatchvalidation = onTaskDispatched(taskRuntimeDefaults, async (req) => {
    const { taskId, questions } = req.data;
    const db = admin.firestore();
    const taskDocRef = db.collection('backgroundTasks').doc(taskId);

    const safeUpdateProgress = async ({ completed = 0, validated = 0, failed = 0 }) => {
        try {
            await db.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(taskDocRef);
                if (!snapshot.exists) {
                    throw new Error(`Task ${taskId} not found during progress update`);
                }

                const data = snapshot.data() || {};
                const status = data.status;
                if (['cancelled', 'failed'].includes(status)) {
                    return;
                }

                const currentProgress = data.progress || {};
                const nextProgress = {
                    total: questions.length,
                    completed: Math.max(currentProgress.completed ?? 0, completed),
                    validated: Math.max(currentProgress.validated ?? 0, validated),
                    failed: Math.max(currentProgress.failed ?? 0, failed),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };

                transaction.update(taskDocRef, { progress: nextProgress });
            });
        } catch (progressError) {
            logger.warn(`Failed to update progress for batch task ${taskId}`, { error: progressError.message });
        }
    };

    // Hämta provider settings
    const settings = await getProviderSettings();
    const validationSettings = settings.validation || { anthropic: true, openai: true, gemini: true };

    const anthropicKey = anthropicApiKey.value();
    const geminiKey = geminiApiKey.value();
    const openaiKey = openaiApiKey.value();
    const providerKeys = {
        anthropic: anthropicKey && validationSettings.anthropic !== false ? anthropicKey : null,
        gemini: geminiKey && validationSettings.gemini !== false ? geminiKey : null,
        openai: openaiKey && validationSettings.openai !== false ? openaiKey : null
    };
    const enabledProviders = Object.entries(providerKeys)
        .filter(([, key]) => Boolean(key))
        .map(([name]) => name);

    if (enabledProviders.length === 0) {
        await taskDocRef.update({
            status: 'failed',
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: 'AI-valideringen avbröts: inga AI-leverantörer är konfigurerade.'
        });
        logger.error(`Batch validation task ${taskId} aborted: no AI providers configured.`);
        return;
    }

    try {
        await taskDocRef.update({
            status: 'processing',
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            progress: {
                total: questions.length,
                completed: 0,
                validated: 0,
                failed: 0,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        });

        logger.info(`Processing batch AI validation task ${taskId}`, { questionCount: questions.length });

        const results = [];
        let completedCount = 0;
        let validatedCount = 0;
        let failedCount = 0;

        const providerHealth = Object.fromEntries(enabledProviders.map((name) => [name, 'unknown']));
        const formatProviderName = (provider) => provider.charAt(0).toUpperCase() + provider.slice(1);

        // Process each question
        for (const questionData of questions) {
            try {
                const { id, question, options, correctOption, explanation } = questionData;

                const validationResults = {};
                const reasoningSections = [];
                let suggestedCorrectOption;

                if (anthropicKey) {
                    try {
                        const { validateQuestion } = require('./services/aiQuestionValidator');
                        const result = await validateQuestion({ question, options, correctOption, explanation }, anthropicKey);
                        validationResults.anthropic = result;
                        providerHealth.anthropic = 'healthy';
                        if (typeof result.reasoning === 'string' && result.reasoning.trim()) {
                            reasoningSections.push(`**Anthropic:** ${result.reasoning}`);
                        }
                    } catch (error) {
                        logger.error(`Anthropic validation failed for question ${id}`, { error: error.message });
                        validationResults.anthropic = {
                            valid: null,
                            error: error.message,
                            unavailable: true
                        };
                        if (providerHealth.anthropic !== 'healthy') {
                            providerHealth.anthropic = 'unavailable';
                        }
                    }
                }

                if (geminiKey) {
                    try {
                        const { validateQuestion } = require('./services/geminiQuestionValidator');
                        const result = await validateQuestion({ question, options, correctOption, explanation }, geminiKey);
                        validationResults.gemini = result;
                        providerHealth.gemini = 'healthy';
                        if (typeof result.reasoning === 'string' && result.reasoning.trim()) {
                            reasoningSections.push(`**Gemini:** ${result.reasoning}`);
                        }
                    } catch (error) {
                        logger.error(`Gemini validation failed for question ${id}`, { error: error.message });
                        validationResults.gemini = {
                            valid: null,
                            error: error.message,
                            unavailable: true
                        };
                        if (providerHealth.gemini !== 'healthy') {
                            providerHealth.gemini = 'unavailable';
                        }
                    }
                }

                if (openaiKey) {
                    try {
                        const { validateQuestion } = require('./services/openaiQuestionValidator');
                        const result = await validateQuestion({ question, options, correctOption, explanation }, openaiKey);
                        validationResults.openai = result;
                        providerHealth.openai = 'healthy';
                        if (typeof result.reasoning === 'string' && result.reasoning.trim()) {
                            reasoningSections.push(`**OpenAI:** ${result.reasoning}`);
                        }
                    } catch (error) {
                        logger.error(`OpenAI validation failed for question ${id}`, { error: error.message });
                        validationResults.openai = {
                            valid: null,
                            error: error.message,
                            unavailable: true
                        };
                        if (providerHealth.openai !== 'healthy') {
                            providerHealth.openai = 'unavailable';
                        }
                    }
                }

                const successfulProviders = Object.entries(validationResults)
                    .filter(([, result]) => typeof result?.valid === 'boolean');

                if (successfulProviders.length === 0) {
                    if (enabledProviders.every((name) => providerHealth[name] === 'unavailable')) {
                        throw new Error('AI-valideringen avbröts: inga AI-leverantörer är tillgängliga just nu.');
                    }

                    const providerErrors = Object.entries(validationResults)
                        .filter(([, result]) => result?.error)
                        .map(([providerName, result]) => `[${formatProviderName(providerName)}] ${result.error}`);

                    completedCount++;
                    failedCount++;

                    await safeUpdateProgress({
                        completed: completedCount,
                        validated: validatedCount,
                        failed: failedCount
                    });
                    logger.info(`Batch validation progress ${taskId}: ${completedCount}/${questions.length} (${validatedCount} godkända, ${failedCount} underkända)`);

                    results.push({
                        questionId: id,
                        valid: false,
                        issues: providerErrors.length > 0
                            ? providerErrors
                            : ['AI-valideringen kunde inte genomföras för frågan.'],
                        reasoning: '',
                        providerResults: validationResults,
                        providersChecked: successfulProviders.length
                    });

                    continue;
                }

                const invalidProviders = successfulProviders.filter(([, result]) => result.valid === false);
                const validProviders = successfulProviders.filter(([, result]) => result.valid === true);

                // Majoritetsbased konsensus: frågan är giltig om majoriteten säger ja
                const majorityValid = validProviders.length > invalidProviders.length;

                const issues = invalidProviders.flatMap(([providerName, result]) => {
                    const providerLabel = formatProviderName(providerName);
                    if (Array.isArray(result.issues) && result.issues.length > 0) {
                        return result.issues.map((issue) => `[${providerLabel}] ${issue}`);
                    }
                    return [`[${providerLabel}] AI-valideringen rapporterade ett problem utan detaljer`];
                });

                if (invalidProviders.length > 0 && suggestedCorrectOption === undefined) {
                    const suggested = invalidProviders
                        .map(([, result]) => result.suggestedCorrectOption)
                        .find((value) => value !== undefined);
                    if (suggested !== undefined) {
                        suggestedCorrectOption = suggested;
                    }
                }

                const questionValid = majorityValid;
                const reasoning = reasoningSections.join('\n\n').trim();

                completedCount++;
                if (questionValid) {
                    validatedCount++;
                } else {
                    failedCount++;
                }

                await safeUpdateProgress({
                    completed: completedCount,
                    validated: validatedCount,
                    failed: failedCount
                });
                logger.info(`Batch validation progress ${taskId}: ${completedCount}/${questions.length} (${validatedCount} godkända, ${failedCount} underkända)`);

                const questionResult = {
                    questionId: id,
                    valid: questionValid,
                    consensus: {
                        valid: validProviders.length,
                        invalid: invalidProviders.length,
                        total: successfulProviders.length,
                        method: 'majority'
                    },
                    issues,
                    reasoning,
                    providerResults: validationResults,
                    providersChecked: successfulProviders.length
                };

                if (suggestedCorrectOption !== undefined) {
                    questionResult.suggestedCorrectOption = suggestedCorrectOption;
                }

                if (Object.values(validationResults).some((result) => result?.error && !result?.valid)) {
                    questionResult.providerErrors = Object.entries(validationResults)
                        .filter(([, result]) => result?.error)
                        .map(([providerName, result]) => ({
                            provider: formatProviderName(providerName),
                            error: result.error
                        }));
                }

                // SPARA RESULTATET TILL FIRESTORE-FRÅGEDOKUMENTET
                try {
                    const questionRef = db.collection('questions').doc(id);
                    await questionRef.update({
                        aiValidated: questionValid,
                        ...(questionValid ? { aiValidatedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
                        aiValidationResult: questionResult
                    });
                    logger.info(`Updated question ${id} with validation result: ${questionValid ? 'valid' : 'invalid'}`);
                } catch (updateError) {
                    logger.error(`Failed to update question ${id} with validation result`, { error: updateError.message });
                    // Continue processing even if update fails
                }

                results.push(questionResult);

            } catch (error) {
                logger.error(`Failed to validate question in batch ${taskId}`, { error: error.message });
                results.push({
                    questionId: questionData.id,
                    valid: false,
                    issues: [`Systemfel: ${error.message}`],
                    providerResults: {},
                    providersChecked: 0
                });
                completedCount++;
                failedCount++;

                await safeUpdateProgress({
                    completed: completedCount,
                    validated: validatedCount,
                    failed: failedCount
                });
                logger.info(`Batch validation progress ${taskId}: ${completedCount}/${questions.length} (${validatedCount} godkända, ${failedCount} underkända)`);
            }
        }

        const finalResult = {
            total: questions.length,
            validated: validatedCount,
            failed: failedCount,
            results: results
        };

        await db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(taskDocRef);
            if (!snapshot.exists) {
                throw new Error(`Task ${taskId} disappeared before completion update`);
            }

            const data = snapshot.data() || {};
            const currentProgress = data.progress || {};
            const nextProgress = {
                total: questions.length,
                completed: Math.max(currentProgress.completed ?? 0, completedCount),
                validated: Math.max(currentProgress.validated ?? 0, validatedCount),
                failed: Math.max(currentProgress.failed ?? 0, failedCount),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const updates = { progress: nextProgress };
            if (data.status !== 'completed' && data.status !== 'failed' && data.status !== 'cancelled') {
                updates.status = 'completed';
                updates.finishedAt = admin.firestore.FieldValue.serverTimestamp();
                updates.result = finalResult;
            } else if (!data.result) {
                updates.result = finalResult;
            }

            transaction.update(taskDocRef, updates);
        });

        logger.info(`Successfully completed batch AI validation task ${taskId}`, { validated: validatedCount, failed: failedCount });

    } catch (error) {
        logger.error(`Failed batch AI validation task ${taskId}`, { error: error.message, stack: error.stack });
        await taskDocRef.update({
            status: 'failed',
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: error.message
        });
    }
});

/**
 * Queue a task to regenerate emojis for multiple questions.
 */
exports.batchRegenerateEmojis = createHttpsHandler(async (req, res) => {
    return cors(req, res, async () => {
        if (!ensurePost(req, res)) {
            return;
        }

        try {
            const idToken = req.headers.authorization?.split('Bearer ')[1];
            if (!idToken) {
                return res.status(401).json({ error: "Unauthorized: No token provided" });
            }

            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const userId = decodedToken.uid;

            const { questionIds } = req.body;

            if (!Array.isArray(questionIds) || questionIds.length === 0) {
                return res.status(400).json({ error: "questionIds must be a non-empty array" });
            }

            const taskId = await enqueueTask('batchregenerateemojis', { questionIds }, userId);

            res.status(202).json({
                success: true,
                message: `Batch emoji regeneration of ${questionIds.length} questions has been queued.`,
                taskId: taskId,
                questionCount: questionIds.length
            });
        } catch (error) {
            logger.error("Error queueing batch emoji regeneration", { error: error.message, stack: error.stack });
            if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
                return res.status(401).json({ error: "Unauthorized: Invalid token" });
            }
            res.status(500).json({ error: "Failed to queue batch emoji regeneration task.", message: error.message });
        }
    });
});

/**
 * Task-dispatched function to run batch emoji regeneration.
 */
exports.runaibatchregenerateemojis = onTaskDispatched(taskRuntimeDefaults, async (req) => {
    const { taskId, questionIds } = req.data;
    const db = admin.firestore();
    const taskDocRef = db.collection('backgroundTasks').doc(taskId);

    const safeUpdateProgress = async ({ phase = '', completed = 0, total = 0, details = '' }) => {
        try {
            await db.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(taskDocRef);
                if (!snapshot.exists) {
                    throw new Error(`Task ${taskId} not found during progress update`);
                }
                const data = snapshot.data() || {};
                if (['cancelled', 'failed', 'completed'].includes(data.status)) {
                    return;
                }
                const nextProgress = { phase, completed, total, details, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
                transaction.update(taskDocRef, { progress: nextProgress });
            });
        } catch (progressError) {
            logger.warn(`Failed to update progress for batch emoji task ${taskId}`, { error: progressError.message });
        }
    };

    try {
        await taskDocRef.update({
            status: 'processing',
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            progress: { phase: 'Initierar', completed: 0, total: questionIds.length, details: 'Förbereder regenerering av emojis...' }
        });

        const illustrationProviders = await getProvidersForPurpose('illustration');
        if (illustrationProviders.length === 0) {
            throw new Error('No illustration providers are enabled and configured');
        }

        let generatedCount = 0;
        let failedCount = 0;
        const updates = [];

        const questionRefs = questionIds.map(id => db.collection('questions').doc(id));
        const questionSnapshots = await db.getAll(...questionRefs);

        await safeUpdateProgress({ phase: 'Hämtar frågor', completed: 0, total: questionIds.length, details: `Hittade ${questionSnapshots.length} frågor att uppdatera` });

        const toArray = (value) => {
            if (Array.isArray(value)) return value;
            if (value && typeof value === 'object') return Object.values(value);
            if (typeof value === 'string' && value.trim().length > 0) return [value];
            return [];
        };

        for (const doc of questionSnapshots) {
            if (!doc.exists) {
                logger.warn(`Question ${doc.id} not found in batch emoji regeneration.`);
                failedCount++;
                continue;
            }
            const data = doc.data();
            const questionPayload = {
                question: data.languages?.sv?.text || data.question?.sv || data.question || data.text || '',
                options: toArray(data.languages?.sv?.options || data.options?.sv || data.options || []),
                explanation: data.languages?.sv?.explanation || data.explanation?.sv || data.explanation || ''
            };

            const emojiOutcome = await runEmojiGenerationWithProviders(questionPayload, illustrationProviders, doc.id, null);

            if (emojiOutcome) {
                updates.push({
                    ref: doc.ref,
                    data: {
                        illustration: emojiOutcome.emoji,
                        illustrationProvider: emojiOutcome.provider.name,
                        illustrationGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
                    }
                });
                generatedCount++;
            } else {
                failedCount++;
                logger.warn('All illustration providers failed to generate emoji for question ' + doc.id);
            }
            await safeUpdateProgress({ phase: 'Regenererar emojis', completed: generatedCount + failedCount, total: questionIds.length, details: `${generatedCount} emojis uppdaterade, ${failedCount} misslyckades` });
        }

        await safeUpdateProgress({ phase: 'Sparar ändringar', completed: questionIds.length, total: questionIds.length, details: `Sparar ${updates.length} uppdateringar...` });

        let currentBatch = db.batch();
        let batchCount = 0;
        const batchOps = [];
        for (const update of updates) {
            currentBatch.update(update.ref, update.data);
            batchCount++;
            if (batchCount >= 400) {
                batchOps.push(currentBatch.commit());
                currentBatch = db.batch();
                batchCount = 0;
            }
        }
        if (batchCount > 0) {
            batchOps.push(currentBatch.commit());
        }
        await Promise.all(batchOps);

        const result = { generated: generatedCount, failed: failedCount, total: questionIds.length };
        await taskDocRef.update({
            status: 'completed',
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            result,
            progress: { phase: 'Klar', completed: questionIds.length, total: questionIds.length, details: `${generatedCount} emojis uppdaterade, ${failedCount} misslyckades` }
        });
        logger.info(`Successfully completed batch emoji regeneration task ${taskId}`);

    } catch (error) {
        logger.error(`Failed batch emoji regeneration task ${taskId}`, { error: error.message, stack: error.stack });
        await taskDocRef.update({
            status: 'failed',
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: error.message,
            progress: { phase: 'Misslyckades', details: error.message }
        });
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
        alreadyHas: alreadyHasCount,
        total: snapshot.size
      });

      res.status(200).json({
        message: 'Questions updated successfully',
        updated: updatedCount,
        alreadyHas: alreadyHasCount,
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

/**
 * Migration function to update questions to new schema using AI categorization
 * - difficulty → ageGroups (array) - AI determines which age groups fit
 * - category → categories (array) - AI determines which categories fit
 * - Add targetAudience field
 * Call this: https://europe-west1-geoquest2-7e45c.cloudfunctions.net/migrateQuestionsToNewSchema
 */
exports.migrateQuestionsToNewSchema = onRequest({
  region: "europe-west1",
  timeoutSeconds: 540, // 9 minutes
  secrets: [anthropicApiKey, openaiApiKey, geminiApiKey]
}, async (req, res) => {
  cors(req, res, async () => {
    try {
      logger.info('Starting AI-powered migration of questions to new schema');

      const migrationProviders = await getProvidersForPurpose('migration');
      if (migrationProviders.length === 0) {
        return res.status(500).json({
          error: 'AI migration requires at least one provider to be enabled and configured'
        });
      }

      // Get illustration providers separately for Emoji generation
      const illustrationProviders = await getProvidersForPurpose('illustration');

      logger.info('Migration providers resolved', {
        categorization: migrationProviders.map((provider) => provider.name),
        illustration: illustrationProviders.map((provider) => provider.name)
      });

      const db = admin.firestore();
      const questionsRef = db.collection('questions');
      const snapshot = await questionsRef.get();

      if (snapshot.empty) {
        logger.info('No questions found in Firestore');
        return res.status(200).json({ message: 'No questions found', migrated: 0 });
      }

      logger.info('Found ' + snapshot.size + ' questions to migrate with AI categorization');

      let migratedCount = 0;
      let previouslyMigratedCount = 0;
      let failedCount = 0;
      let emojiGeneratedCount = 0;
      let emojiFailedCount = 0;
      const updates = [];
      const toArray = (value) => {
        if (Array.isArray(value)) {
          return value;
        }
        if (value && typeof value === 'object') {
          return Object.values(value);
        }
        if (typeof value === 'string' && value.trim().length > 0) {
          return [value];
        }
        return [];
      };

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const wasPreviouslyMigrated = Array.isArray(data.ageGroups) && Array.isArray(data.categories) && Boolean(data.targetAudience);
        if (wasPreviouslyMigrated) {
          previouslyMigratedCount++;
        }

        const questionTextRaw =
          data.languages?.sv?.text ||
          data.question?.sv ||
          data.question ||
          data.text ||
          data.languages?.en?.text ||
          '';
        const questionText = typeof questionTextRaw === 'string' && questionTextRaw.trim().length > 0
          ? questionTextRaw
          : 'Okänd fråga från tidigare import';

        const rawOptions =
          data.languages?.sv?.options ||
          data.options?.sv ||
          data.options ||
          data.languages?.en?.options ||
          [];
        const normalizedOptions = toArray(rawOptions)
          .map((option) => (typeof option === 'string' ? option : String(option ?? '')))
          .filter((option) => option.trim().length > 0);

        const explanationText =
          data.languages?.sv?.explanation ||
          data.explanation?.sv ||
          data.explanation ||
          data.languages?.en?.explanation ||
          '';

        const questionPayload = {
          question: questionText,
          options: normalizedOptions,
          explanation: explanationText
        };

        const categorizationOutcome = await runCategorizationWithProviders(questionPayload, migrationProviders, doc.id);

        if (!categorizationOutcome) {
          logger.error('All migration providers failed to categorize question ' + doc.id);
          failedCount++;
          const fallbackData = {
            ageGroups: Array.isArray(data.ageGroups) && data.ageGroups.length > 0 ? data.ageGroups : ['adults'],
            categories: Array.isArray(data.categories) && data.categories.length > 0 ? data.categories : ['Gåtor'],
            targetAudience: data.targetAudience || 'swedish',
            migrated: true,
            migratedAt: admin.firestore.FieldValue.serverTimestamp(),
            migrationVersion: 'v2-reprocess',
            migrationProvider: 'fallback',
            migrationError: 'categorization_failed',
            difficulty: admin.firestore.FieldValue.delete(),
            category: admin.firestore.FieldValue.delete(),
            migrationSvgProvider: admin.firestore.FieldValue.delete()
          };
          if (data.audience !== undefined) {
            fallbackData.audience = admin.firestore.FieldValue.delete();
          }
          if (data.migrationReasoning) {
            fallbackData.migrationReasoning = admin.firestore.FieldValue.delete();
          }

          updates.push({
            ref: doc.ref,
            data: fallbackData
          });

          continue;
        }

        const { result: categorization, provider: categorizeProvider } = categorizationOutcome;

        const updateData = {
          ageGroups: categorization.ageGroups,
          categories: categorization.categories,
          targetAudience: data.targetAudience || 'swedish',
          migrated: true,
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          migrationVersion: 'v2-reprocess',
          migrationProvider: categorizeProvider.name,
          difficulty: admin.firestore.FieldValue.delete(),
          category: admin.firestore.FieldValue.delete()
        };

        if (data.audience !== undefined) {
          updateData.audience = admin.firestore.FieldValue.delete();
        }

        if (categorization.reasoning) {
          updateData.migrationReasoning = categorization.reasoning;
        } else if (data.migrationReasoning) {
          updateData.migrationReasoning = admin.firestore.FieldValue.delete();
        }

        const emojiOutcome = await runEmojiGenerationWithProviders(questionPayload, illustrationProviders, doc.id, null);
        if (emojiOutcome) {
          updateData.illustration = emojiOutcome.emoji;
          updateData.illustrationProvider = emojiOutcome.provider.name;
          updateData.illustrationGeneratedAt = admin.firestore.FieldValue.serverTimestamp();
          updateData.migrationSvgProvider = emojiOutcome.provider.name;
          emojiGeneratedCount++;
        } else {
          emojiFailedCount++;
          logger.warn('All illustration providers failed to generate Emoji for question ' + doc.id);
          if (!data.illustration) {
            updateData.illustration = admin.firestore.FieldValue.delete();
          }
        }

        updates.push({
          ref: doc.ref,
          data: updateData
        });

        migratedCount++;
      }

      let currentBatch = db.batch();
      let batchCount = 0;
      const batchOps = [];

      for (const update of updates) {
        currentBatch.update(update.ref, update.data);
        batchCount++;
        if (batchCount >= 400) {
          batchOps.push(currentBatch.commit());
          currentBatch = db.batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        batchOps.push(currentBatch.commit());
      }

      await Promise.all(batchOps);

      logger.info('Finished migrating questions with AI', {
        migrated: migratedCount,
        emojiGenerated: emojiGeneratedCount,
        emojiFailed: emojiFailedCount,
        previouslyMigrated: previouslyMigratedCount,
        failed: failedCount,
        total: snapshot.size,
        providers: migrationProviders.map((provider) => provider.name)
      });

      res.status(200).json({
        message: 'Questions migrated successfully with AI categorization',
        migrated: migratedCount,
        emojiGenerated: emojiGeneratedCount,
        emojiFailed: emojiFailedCount,
        previouslyMigrated: previouslyMigratedCount,
        failed: failedCount,
        total: snapshot.size,
        details: {
          method: 'AI-powered categorization and illustration using configured providers',
          ageGroupsIdentified: 'AI analyzed each question to determine suitable age groups',
          categoriesIdentified: 'AI analyzed each question to determine relevant categories',
          emojiIllustrations: 'AI generated Emoji illustrations for each question',
          targetAudience: 'Set to swedish for all questions',
          removedFields: 'difficulty, category, audience',
          providers: migrationProviders.map((provider) => provider.name)
        }
      });
    } catch (error) {
      logger.error('Error migrating questions', { error: error.message, stack: error.stack });
      res.status(500).json({
        error: 'Failed to migrate questions',
        message: error.message
      });
    }
  });
});

exports.cleanupStuckTasks = onRequest({
  region: "europe-west1",
  timeoutSeconds: 300, // 5 minutes
}, async (req, res) => {
  cors(req, res, async () => {
    try {
      logger.info('Starting cleanup of stuck background tasks');

      const db = admin.firestore();
      const tasksRef = db.collection('backgroundTasks');

      // Find all tasks that are "processing" or "queued"
      const processingSnapshot = await tasksRef.where('status', '==', 'processing').get();
      const queuedSnapshot = await tasksRef.where('status', '==', 'queued').get();

      const now = admin.firestore.Timestamp.now();
      const thirtyMinutesAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 30 * 60 * 1000);
      const threeHoursAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 3 * 60 * 60 * 1000);

      let cleanedCount = 0;
      const batchOps = [];
      let currentBatch = db.batch();
      let batchCount = 0;

      // Check processing tasks
      for (const doc of processingSnapshot.docs) {
        const data = doc.data();
        const createdAt = data.createdAt || data.startedAt;

        // Batch validation tasks get 3 hours, others get 30 minutes
        const taskType = data.taskType;
        const timeoutThreshold = taskType === 'batchvalidation' ? threeHoursAgo : thirtyMinutesAgo;
        const timeoutMinutes = taskType === 'batchvalidation' ? 180 : 30;

        if (createdAt && createdAt.toMillis() < timeoutThreshold.toMillis()) {
          currentBatch.update(doc.ref, {
            status: 'failed',
            error: `Task timed out after ${timeoutMinutes} minutes`,
            finishedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          cleanedCount++;
          batchCount++;

          // Firestore batch limit is 500
          if (batchCount >= 400) {
            batchOps.push(currentBatch.commit());
            currentBatch = db.batch();
            batchCount = 0;
          }
        }
      }

      // Check queued tasks
      for (const doc of queuedSnapshot.docs) {
        const data = doc.data();
        const createdAt = data.createdAt;

        if (createdAt && createdAt.toMillis() < thirtyMinutesAgo.toMillis()) {
          currentBatch.update(doc.ref, {
            status: 'failed',
            error: 'Task stuck in queue for more than 30 minutes',
            finishedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          cleanedCount++;
          batchCount++;

          if (batchCount >= 400) {
            batchOps.push(currentBatch.commit());
            currentBatch = db.batch();
            batchCount = 0;
          }
        }
      }

      // Commit remaining batch
      if (batchCount > 0) {
        batchOps.push(currentBatch.commit());
      }

      await Promise.all(batchOps);

      logger.info('Finished cleaning up stuck tasks', { cleaned: cleanedCount });

      res.status(200).json({
        message: 'Cleanup completed successfully',
        cleaned: cleanedCount,
        processingChecked: processingSnapshot.size,
        queuedChecked: queuedSnapshot.size
      });
    } catch (error) {
      logger.error('Error cleaning up stuck tasks', { error: error.message });
      res.status(500).json({
        error: 'Failed to cleanup stuck tasks',
        message: error.message
      });
    }
  });
});

/**
 * Admin function to delete all old completed and failed background tasks
 * Call this: https://europe-west1-geoquest2-7e45c.cloudfunctions.net/deleteOldTasks
 */
exports.deleteOldTasks = onRequest({
  region: "europe-west1",
  timeoutSeconds: 300, // 5 minutes
}, async (req, res) => {
  cors(req, res, async () => {
    try {
      logger.info('Starting deletion of old background tasks');

      const db = admin.firestore();
      const tasksRef = db.collection('backgroundTasks');

      // Get query parameter for age threshold (default 24 hours)
      const hoursOld = parseInt(req.query.hours) || 24;

      const now = admin.firestore.Timestamp.now();
      const thresholdTime = admin.firestore.Timestamp.fromMillis(now.toMillis() - hoursOld * 60 * 60 * 1000);

      // Find all completed and failed tasks older than threshold
      const completedSnapshot = await tasksRef
        .where('status', '==', 'completed')
        .where('finishedAt', '<', thresholdTime)
        .get();

      const failedSnapshot = await tasksRef
        .where('status', '==', 'failed')
        .where('finishedAt', '<', thresholdTime)
        .get();

      let deletedCount = 0;
      const batchOps = [];
      let currentBatch = db.batch();
      let batchCount = 0;

      // Delete completed tasks
      for (const doc of completedSnapshot.docs) {
        currentBatch.delete(doc.ref);
        deletedCount++;
        batchCount++;

        if (batchCount >= 400) {
          batchOps.push(currentBatch.commit());
          currentBatch = db.batch();
          batchCount = 0;
        }
      }

      // Delete failed tasks
      for (const doc of failedSnapshot.docs) {
        currentBatch.delete(doc.ref);
        deletedCount++;
        batchCount++;

        if (batchCount >= 400) {
          batchOps.push(currentBatch.commit());
          currentBatch = db.batch();
          batchCount = 0;
        }
      }

      // Commit remaining batch
      if (batchCount > 0) {
        batchOps.push(currentBatch.commit());
      }

      await Promise.all(batchOps);

      logger.info('Finished deleting old tasks', { deleted: deletedCount, hoursOld });

      res.status(200).json({
        message: 'Old tasks deleted successfully',
        deleted: deletedCount,
        completedDeleted: completedSnapshot.size,
        failedDeleted: failedSnapshot.size,
        hoursOld
      });
    } catch (error) {
      logger.error('Error deleting old tasks', { error: error.message });
      res.status(500).json({
        error: 'Failed to delete old tasks',
        message: error.message
      });
    }
  });
});

/**
 * Task-dispatched function to run AI migration.
 */
exports.runaimigration = onTaskDispatched(taskRuntimeDefaults, async (req) => {
    const { taskId } = req.data;
    const db = admin.firestore();
    const taskDocRef = db.collection('backgroundTasks').doc(taskId);
    const existingSnapshot = await taskDocRef.get();
    if (!existingSnapshot.exists) {
        logger.error(`Migration task ${taskId} not found`);
        return;
    }
    const existingData = existingSnapshot.data() || {};
    if (['completed', 'failed', 'cancelled'].includes(existingData.status)) {
        logger.info(`Skipping migration task ${taskId} because status is ${existingData.status}`);
        return;
    }

    const safeUpdateProgress = async ({ phase = '', completed = 0, total = 0, details = '' }) => {
        try {
            await db.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(taskDocRef);
                if (!snapshot.exists) {
                    throw new Error(`Task ${taskId} not found during progress update`);
                }

                const data = snapshot.data() || {};
                const status = data.status;
                if (['cancelled', 'failed', 'completed'].includes(status)) {
                    return;
                }

                const nextProgress = {
                    phase,
                    completed: Math.max(0, completed),
                    total: Math.max(0, total),
                    details,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };

                transaction.update(taskDocRef, { progress: nextProgress });
            });
        } catch (progressError) {
            logger.warn(`Failed to update progress for migration task ${taskId}`, { error: progressError.message });
        }
    };

    try {
        await taskDocRef.update({
            status: 'processing',
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            progress: {
                phase: 'Initierar',
                completed: 0,
                total: 0,
                details: 'Förbereder AI-migrering...',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        });
        logger.info(`Processing AI migration task ${taskId}`);

        const migrationProviders = await getProvidersForPurpose('migration');
        if (migrationProviders.length === 0) {
            throw new Error('AI migration requires at least one provider to be enabled and configured');
        }

        // Get illustration providers separately for Emoji generation
        const illustrationProviders = await getProvidersForPurpose('illustration');

        logger.info('Migration providers resolved', {
            taskId,
            categorization: migrationProviders.map((provider) => provider.name),
            illustration: illustrationProviders.map((provider) => provider.name)
        });

        const questionsRef = db.collection('questions');
        const snapshot = await questionsRef.get();

        if (snapshot.empty) {
            throw new Error('No questions found in Firestore');
        }

        await safeUpdateProgress({
            phase: 'Hämtar frågor',
            completed: 0,
            total: snapshot.size,
            details: `Hittade ${snapshot.size} frågor att migrera`
        });

        let migratedCount = 0;
        let previouslyMigratedCount = 0;
        let failedCount = 0;
        let emojiGeneratedCount = 0;
        let emojiFailedCount = 0;
        let processedCount = 0;
        const updates = [];
        const toArray = (value) => {
            if (Array.isArray(value)) {
                return value;
            }
            if (value && typeof value === 'object') {
                return Object.values(value);
            }
            if (typeof value === 'string' && value.trim().length > 0) {
                return [value];
            }
            return [];
        };

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const wasPreviouslyMigrated = Array.isArray(data.ageGroups) && Array.isArray(data.categories) && Boolean(data.targetAudience);
            if (wasPreviouslyMigrated) {
                previouslyMigratedCount++;
            }

            const questionTextRaw =
                data.languages?.sv?.text ??
                data.question?.sv ??
                data.question ??
                data.text ??
                data.languages?.en?.text ??
                '';
            const questionText = typeof questionTextRaw === 'string' && questionTextRaw.trim().length > 0
                ? questionTextRaw
                : 'Okänd fråga från tidigare import';

            const rawOptions =
                data.languages?.sv?.options ??
                data.options?.sv ??
                data.options ??
                data.languages?.en?.options ??
                [];
            const normalizedOptions = toArray(rawOptions)
                .map((option) => (typeof option === 'string' ? option : String(option ?? '')))
                .filter((option) => option.trim().length > 0);

            const explanationText =
                data.languages?.sv?.explanation ??
                data.explanation?.sv ??
                data.explanation ??
                data.languages?.en?.explanation ??
                '';

            const questionPayload = {
                question: questionText,
                options: normalizedOptions,
                explanation: explanationText
            };

            const categorizationOutcome = await runCategorizationWithProviders(questionPayload, migrationProviders, doc.id);

        if (!categorizationOutcome) {
          logger.error('All migration providers failed to categorize question ' + doc.id);
          failedCount++;
          const fallbackData = {
            ageGroups: Array.isArray(data.ageGroups) && data.ageGroups.length > 0 ? data.ageGroups : ['adults'],
            categories: Array.isArray(data.categories) && data.categories.length > 0 ? data.categories : ['Gåtor'],
            targetAudience: data.targetAudience || 'swedish',
            migrated: true,
            migratedAt: admin.firestore.FieldValue.serverTimestamp(),
            migrationVersion: 'v2-reprocess',
            migrationProvider: 'fallback',
            migrationError: 'categorization_failed',
            difficulty: admin.firestore.FieldValue.delete(),
            category: admin.firestore.FieldValue.delete(),
            migrationSvgProvider: admin.firestore.FieldValue.delete()
          };
                if (data.audience !== undefined) {
                    fallbackData.audience = admin.firestore.FieldValue.delete();
                }
                if (data.migrationReasoning) {
                    fallbackData.migrationReasoning = admin.firestore.FieldValue.delete();
                }

                updates.push({
                    ref: doc.ref,
                    data: fallbackData
                });

                processedCount++;
                await safeUpdateProgress({
                    phase: 'Migrerar & illustrerar',
                    completed: processedCount,
                    total: snapshot.size,
                    details: `${migratedCount} uppdaterade, ${emojiGeneratedCount} Emoji skapade, ${failedCount} misslyckades`
                });

                continue;
            }

            const { result: categorization, provider: categorizeProvider } = categorizationOutcome;

            const updateData = {
                ageGroups: categorization.ageGroups,
                categories: categorization.categories,
                targetAudience: data.targetAudience || 'swedish',
                migrated: true,
                migratedAt: admin.firestore.FieldValue.serverTimestamp(),
                migrationVersion: 'v2-reprocess',
                migrationProvider: categorizeProvider.name,
                difficulty: admin.firestore.FieldValue.delete(),
                category: admin.firestore.FieldValue.delete()
            };

            if (data.audience !== undefined) {
                updateData.audience = admin.firestore.FieldValue.delete();
            }

            if (categorization.reasoning) {
                updateData.migrationReasoning = categorization.reasoning;
            } else if (data.migrationReasoning) {
                updateData.migrationReasoning = admin.firestore.FieldValue.delete();
            }

        const emojiOutcome = await runEmojiGenerationWithProviders(questionPayload, illustrationProviders, doc.id, null);
        if (emojiOutcome) {
          updateData.illustration = emojiOutcome.emoji;
          updateData.illustrationProvider = emojiOutcome.provider.name;
          updateData.illustrationGeneratedAt = admin.firestore.FieldValue.serverTimestamp();
          updateData.migrationSvgProvider = emojiOutcome.provider.name;
          emojiGeneratedCount++;
        } else {
          emojiFailedCount++;
          logger.warn('All illustration providers failed to generate Emoji for question ' + doc.id);
          if (!data.illustration) {
            updateData.illustration = admin.firestore.FieldValue.delete();
          }
        }

            updates.push({
                ref: doc.ref,
                data: updateData
            });

            migratedCount++;
            processedCount++;
            await safeUpdateProgress({
                phase: 'Migrerar & illustrerar',
                completed: processedCount,
                total: snapshot.size,
                details: `${migratedCount} uppdaterade, ${emojiGeneratedCount} Emoji skapade, ${failedCount} misslyckades`
            });
        }
        await safeUpdateProgress({
            phase: 'Sparar ändringar',
            completed: snapshot.size,
            total: snapshot.size,
            details: `Sparar ${updates.length} uppdateringar till databasen...`
        });

        // Applicera alla uppdateringar i batchar
        let currentBatch = db.batch();
        let batchCount = 0;
        const batchOps = [];

        for (const update of updates) {
            currentBatch.update(update.ref, update.data);
            batchCount++;

            if (batchCount >= 400) {
                batchOps.push(currentBatch.commit());
                currentBatch = db.batch();
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            batchOps.push(currentBatch.commit());
        }

        await Promise.all(batchOps);

        logger.info('Queued AI migration import summary', {
            taskId,
            migrated: migratedCount,
            emojiGenerated: emojiGeneratedCount,
            emojiFailed: emojiFailedCount,
            previouslyMigrated: previouslyMigratedCount,
            failed: failedCount,
            total: snapshot.size,
            providers: migrationProviders.map((provider) => provider.name)
        });

        const result = {
            migrated: migratedCount,
            emojiGenerated: emojiGeneratedCount,
            emojiFailed: emojiFailedCount,
            previouslyMigrated: previouslyMigratedCount,
            failed: failedCount,
            total: snapshot.size,
            details: {
                method: 'AI-powered categorization and Emoji illustration using Claude',
                ageGroupsIdentified: 'AI analyzed each question to determine suitable age groups',
                categoriesIdentified: 'AI analyzed each question to determine relevant categories',
                emojiIllustrations: 'AI generated Emoji illustrations for each question',
                targetAudience: 'Set to swedish for all questions',
                removedFields: 'difficulty, category, audience',
                providers: migrationProviders.map((provider) => provider.name)
            }
        };

        await taskDocRef.update({
            status: 'completed',
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            result,
            progress: {
                phase: 'Klar',
                completed: snapshot.size,
                total: snapshot.size,
                details: `${migratedCount} uppdaterade, ${emojiGeneratedCount} Emoji skapade (${emojiFailedCount} illustrationer misslyckades, ${previouslyMigratedCount} tidigare migrerade, ${failedCount} misslyckades)`,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        });
        logger.info(`Successfully completed AI migration task ${taskId}`);

    } catch (error) {
        logger.error(`Failed AI migration task ${taskId}`, { error: error.message, stack: error.stack });
        await taskDocRef.update({
            status: 'failed',
            finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: error.message,
            progress: {
                phase: 'Misslyckades',
                completed: 0,
                total: 0,
                details: error.message,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        });
    }
});

/**
 * Stop a single background task
 * POST body: { taskId: string }
 */
exports.stopTask = onRequest({
  region: "europe-west1",
  timeoutSeconds: 60,
}, async (req, res) => {
  cors(req, res, async () => {
    if (!ensurePost(req, res)) {
      return;
    }

    try {
      const { taskId } = req.body;

      if (!taskId) {
        return res.status(400).json({ error: 'taskId is required' });
      }

      const db = admin.firestore();
      const taskRef = db.collection('backgroundTasks').doc(taskId);
      const taskDoc = await taskRef.get();

      if (!taskDoc.exists) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const taskData = taskDoc.data();
      const currentStatus = taskData.status;

      // Only allow stopping tasks that are running
      if (!['processing', 'queued', 'pending'].includes(currentStatus)) {
        return res.status(400).json({
          error: `Cannot stop task with status: ${currentStatus}`,
          message: 'Only processing, queued, or pending tasks can be stopped'
        });
      }

      await taskRef.update({
        status: 'cancelled',
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: 'Task manually cancelled by user'
      });

      logger.info('Task stopped', { taskId });

      res.status(200).json({
        success: true,
        message: 'Task stopped successfully',
        taskId
      });
    } catch (error) {
      logger.error('Error stopping task', { error: error.message });
      res.status(500).json({
        error: 'Failed to stop task',
        message: error.message
      });
    }
  });
});

/**
 * Delete a single background task
 * POST body: { taskId: string }
 */
exports.deleteTask = onRequest({
  region: "europe-west1",
  timeoutSeconds: 60,
},
async (req, res) => {
  cors(req, res, async () => {
    if (!ensurePost(req, res)) {
      return;
    }

    try {
      const { taskId } = req.body;

      if (!taskId) {
        return res.status(400).json({ error: 'taskId is required' });
      }

      const db = admin.firestore();
      const taskRef = db.collection('backgroundTasks').doc(taskId);
      const taskDoc = await taskRef.get();

      if (!taskDoc.exists) {
        return res.status(404).json({ error: 'Task not found' });
      }

      await taskRef.delete();

      logger.info('Task deleted', { taskId });

      res.status(200).json({
        success: true,
        message: 'Task deleted successfully',
        taskId
      });
    } catch (error) {
      logger.error('Error deleting task', { error: error.message });
      res.status(500).json({
        error: 'Failed to delete task',
        message: error.message
      });
    }
  });
});

/**
 * Stop multiple background tasks
 * POST body: { taskIds: string[] }
 */
exports.bulkStopTasks = onRequest({
  region: "europe-west1",
  timeoutSeconds: 300,
},
async (req, res) => {
  cors(req, res, async () => {
    if (!ensurePost(req, res)) {
      return;
    }

    try {
      const { taskIds } = req.body;

      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'taskIds must be a non-empty array' });
      }

      const db = admin.firestore();
      let stoppedCount = 0;
      const batchOps = [];
      let currentBatch = db.batch();
      let batchCount = 0;

      for (const taskId of taskIds) {
        const taskRef = db.collection('backgroundTasks').doc(taskId);
        const taskDoc = await taskRef.get();

        if (taskDoc.exists) {
          const taskData = taskDoc.data();
          const currentStatus = taskData.status;

          // Only stop tasks that are running
          if (['processing', 'queued', 'pending'].includes(currentStatus)) {
            currentBatch.update(taskRef, {
              status: 'cancelled',
              finishedAt: admin.firestore.FieldValue.serverTimestamp(),
              error: 'Task manually cancelled by user'
            });
            stoppedCount++;
            batchCount++;

            if (batchCount >= 400) {
              batchOps.push(currentBatch.commit());
              currentBatch = db.batch();
              batchCount = 0;
            }
          }
        }
      }

      // Commit remaining batch
      if (batchCount > 0) {
        batchOps.push(currentBatch.commit());
      }

      await Promise.all(batchOps);

      logger.info('Bulk stop tasks completed', { stopped: stoppedCount, requested: taskIds.length });

      res.status(200).json({
        success: true,
        message: `Stopped ${stoppedCount} tasks`,
        stopped: stoppedCount,
        requested: taskIds.length
      });
    } catch (error) {
      logger.error('Error bulk stopping tasks', { error: error.message });
      res.status(500).json({
        error: 'Failed to bulk stop tasks',
        message: error.message
      });
    }
  });
});

/**
 * Delete multiple background tasks
 * POST body: { taskIds: string[] }
 */
exports.bulkDeleteTasks = onRequest({
  region: "europe-west1",
  timeoutSeconds: 300,
},
async (req, res) => {
  cors(req, res, async () => {
    if (!ensurePost(req, res)) {
      return;
    }

    try {
      const { taskIds } = req.body;

      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'taskIds must be a non-empty array' });
      }

      const db = admin.firestore();
      let deletedCount = 0;
      const batchOps = [];
      let currentBatch = db.batch();
      let batchCount = 0;

      for (const taskId of taskIds) {
        const taskRef = db.collection('backgroundTasks').doc(taskId);
        currentBatch.delete(taskRef);
        deletedCount++;
        batchCount++;

        if (batchCount >= 400) {
          batchOps.push(currentBatch.commit());
          currentBatch = db.batch();
          batchCount = 0;
        }
      }

      // Commit remaining batch
      if (batchCount > 0) {
        batchOps.push(currentBatch.commit());
      }

      await Promise.all(batchOps);

      logger.info('Bulk delete tasks completed', { deleted: deletedCount, requested: taskIds.length });

      res.status(200).json({
        success: true,
        message: `Deleted ${deletedCount} tasks`,
        deleted: deletedCount,
        requested: taskIds.length
      });
    } catch (error) {
      logger.error('Error bulk deleting tasks', { error: error.message });
      res.status(500).json({
        error: 'Failed to bulk delete tasks',
        message: error.message
      });
    }
  });
});