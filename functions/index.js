/**
 * Cloud Functions index - Main exports for all Firebase Functions
 * Refactored structure: handlers are in separate files for better
 * maintainability
 */

// ============================================================================
// HANDLERS - Import all HTTP endpoint handlers
// ============================================================================

// Run Management Handlers
const createRun = require("./handlers/runs/createRun");
const generateRoute = require("./handlers/runs/generateRoute");
const joinRun = require("./handlers/runs/joinRun");
const submitAnswer = require("./handlers/runs/submitAnswer");
const closeRun = require("./handlers/runs/closeRun");

// AI Handlers
const getAIStatus = require("./handlers/ai/getAIStatus");
const generateAIQuestions =
  require("./handlers/ai/generateAIQuestions");
const validateQuestionWithAI =
  require("./handlers/ai/validateQuestionWithAI");
const regenerateQuestionEmoji =
  require("./handlers/ai/regenerateQuestionEmoji");
const regenerateAllIllustrations =
  require("./handlers/ai/regenerateAllIllustrations");
const queueMigration = require("./handlers/ai/queueMigration");
const batchValidateQuestions = require("./handlers/ai/batchValidateQuestions");
const batchRegenerateEmojis = require("./handlers/ai/batchRegenerateEmojis");

// Provider Settings Handlers
const getProviderSettings =
  require("./handlers/providers/getProviderSettings");
const updateProviderSettings =
  require("./handlers/providers/updateProviderSettings");

// Payment Handlers
const createPaymentIntent = require("./handlers/payments/createPaymentIntent");
const getStripeStatus = require("./handlers/payments/getStripeStatus");

// Admin Handlers
const updateQuestionsCreatedAt =
  require("./handlers/admin/updateQuestionsCreatedAt");
const migrateQuestionsToNewSchema =
  require("./handlers/admin/migrateQuestionsToNewSchema");
const cleanupStuckTasks =
  require("./handlers/admin/cleanupStuckTasks");
const deleteOldTasks = require("./handlers/admin/deleteOldTasks");
const stopTask = require("./handlers/admin/stopTask");
const deleteTask = require("./handlers/admin/deleteTask");
const bulkStopTasks = require("./handlers/admin/bulkStopTasks");
const bulkDeleteTasks = require("./handlers/admin/bulkDeleteTasks");

// Scheduled Tasks
const questionImport = require("./tasks/questionImport");

// ============================================================================
// EXPORTS - Export all handlers as Cloud Functions
// ============================================================================

// Run Management
exports.createRun = createRun;
exports.generateRoute = generateRoute;
exports.joinRun = joinRun;
exports.submitAnswer = submitAnswer;
exports.closeRun = closeRun;

// AI Operations
exports.getAIStatus = getAIStatus;
exports.generateAIQuestions = generateAIQuestions;
exports.validateQuestionWithAI = validateQuestionWithAI;
exports.regenerateQuestionEmoji = regenerateQuestionEmoji;
exports.regenerateAllIllustrations = regenerateAllIllustrations;
exports.queueMigration = queueMigration;
exports.batchValidateQuestions = batchValidateQuestions;
exports.batchRegenerateEmojis = batchRegenerateEmojis;

// Provider Settings
exports.getProviderSettings = getProviderSettings;
exports.updateProviderSettings = updateProviderSettings;

// Payments
exports.createPaymentIntent = createPaymentIntent;
exports.getStripeStatus = getStripeStatus;

// Admin
exports.updateQuestionsCreatedAt = updateQuestionsCreatedAt;
exports.migrateQuestionsToNewSchema = migrateQuestionsToNewSchema;
exports.cleanupStuckTasks = cleanupStuckTasks;
exports.deleteOldTasks = deleteOldTasks;
exports.stopTask = stopTask;
exports.deleteTask = deleteTask;
exports.bulkStopTasks = bulkStopTasks;
exports.bulkDeleteTasks = bulkDeleteTasks;

// Scheduled Tasks
exports.questionImport = questionImport;

// ============================================================================
// BACKGROUND TASKS - Task-dispatched functions (kept inline for now)
// TODO: Move to tasks/ directory in future refactoring
// ============================================================================

const {onTaskDispatched} = require("firebase-functions/v2/tasks");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const {
  taskRuntimeDefaults,
  anthropicApiKey,
  geminiApiKey,
  openaiApiKey,
} = require("./config/runtime");
const {
  selectRandomProvider,
  getProvidersForPurpose,
} = require("./utils/providers");
const {
  runEmojiGenerationWithProviders,
} = require("./utils/helpers");
const {enqueueTask} = require("./utils/cloudTasks");
const {
  createHttpsHandler,
  ensurePost,
} = require("./utils/middleware");
const {cors} = require("./config/cors");
const {
  loadExistingQuestions,
  prepareQuestionsForImport,
} = require("./services/questionImportService");

exports.runaigeneration = onTaskDispatched(taskRuntimeDefaults, async (req) => {
  const {taskId, amount, category, ageGroup, provider} = req.data;
  const db = admin.firestore();
  const taskDocRef = db.collection("backgroundTasks").doc(taskId);

  const safeUpdateProgress = async ({
    phase = "",
    completed = 0,
    total = 0,
    details = "",
  }) => {
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(taskDocRef);
        if (!snapshot.exists) {
          throw new Error(`Task ${taskId} not found during progress update`);
        }

        const data = snapshot.data() || {};
        const status = data.status;
        if (["cancelled", "failed"].includes(status)) {
          return;
        }

        const nextProgress = {
          phase,
          completed: Math.max(0, completed),
          total: Math.max(0, total),
          details,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        transaction.update(taskDocRef, {progress: nextProgress});
      });
    } catch (progressError) {
      logger.warn(
          `Failed to update progress for generation task ${taskId}`,
          {error: progressError.message},
      );
    }
  };

  try {
    await taskDocRef.update({
      status: "processing",
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      progress: {
        phase: "Initierar",
        completed: 0,
        total: amount,
        details: "Förbereder AI-generering...",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
    logger.info(
        `Processing AI generation task ${taskId}`,
        {amount, category, ageGroup, provider},
    );

    // Default targetAudience to 'swedish' - AI will decide if youth
    // questions should be international
    const targetAudience = "swedish";

    let questions = null;
    let usedProvider = null;
    const anthropicKey = anthropicApiKey.value();

    // Om provider är 'random', slumpa fram en provider
    if (provider === "random") {
      const randomProvider = await selectRandomProvider("generation");
      if (!randomProvider) {
        throw new Error("No AI providers are enabled for generation");
      }
      await safeUpdateProgress({
        phase: "Genererar frågor",
        completed: 0,
        total: amount,
        details: `Använder ${randomProvider.name}...`,
      });
      questions = await randomProvider.generator(
          {amount, category, ageGroup, targetAudience},
          randomProvider.key,
      );
      usedProvider = randomProvider.name;
    } else if (provider === "gemini") {
      const geminiKey = geminiApiKey.value();
      if (geminiKey) {
        await safeUpdateProgress({
          phase: "Genererar frågor",
          completed: 0,
          total: amount,
          details: "Använder Gemini...",
        });
        const {generateQuestions: generateWithGemini} =
          require("./services/geminiQuestionGenerator");
        questions = await generateWithGemini(
            {amount, category, ageGroup, targetAudience},
            geminiKey,
        );
        usedProvider = "gemini";
      }
    } else if (provider === "openai") {
      const openaiKey = openaiApiKey.value();
      if (openaiKey) {
        await safeUpdateProgress({
          phase: "Genererar frågor",
          completed: 0,
          total: amount,
          details: "Använder OpenAI...",
        });
        const {generateQuestions: generateWithOpenAI} =
          require("./services/openaiQuestionGenerator");
        questions = await generateWithOpenAI(
            {amount, category, ageGroup, targetAudience},
            openaiKey,
        );
        usedProvider = "openai";
      }
    } else if (anthropicKey) {
      await safeUpdateProgress({
        phase: "Genererar frågor",
        completed: 0,
        total: amount,
        details: "Använder Anthropic...",
      });
      const {generateQuestions: generateWithAnthropic} =
        require("./services/aiQuestionGenerator");
      questions = await generateWithAnthropic(
          {amount, category, ageGroup, targetAudience},
          anthropicKey,
      );
      usedProvider = "anthropic";
    }

    if (!questions) {
      throw new Error(`Provider ${provider} failed or is not configured.`);
    }

    await safeUpdateProgress({
      phase: "Validerar frågor",
      completed: questions.length,
      total: amount,
      details: `${questions.length} frågor genererade, kontrollerar dubletter...`,
    });

    const existingQuestions = await loadExistingQuestions(db);
    const {questionsToImport, stats} = prepareQuestionsForImport(questions, existingQuestions);

    if (questionsToImport.length === 0) {
      throw new Error("No new questions passed validation/dublettkontroll.");
    }

    // Generera Emoji-illustrationer för frågorna med konfigurerade providers
    const illustrationProviders = await getProvidersForPurpose("illustration");
    const canGenerateEmoji = illustrationProviders.length > 0;

    await safeUpdateProgress({
      phase: "Genererar illustrationer",
      completed: canGenerateEmoji ? 0 : questionsToImport.length,
      total: questionsToImport.length,
      details: canGenerateEmoji ?
                "Skapar Emoji-illustrationer med AI..." :
                "Inga illustration-providers aktiverade - hoppar över Emoji-generering",
    });

    let emojiGeneratedCount = 0;
    let emojiFailedCount = 0;
    let emojiSkippedCount = 0;

    if (!canGenerateEmoji) {
      emojiSkippedCount = questionsToImport.length;
      logger.warn(
          "Skipping Emoji generation for AI questions - " +
        "no illustration providers available",
      );
    } else {
      for (const question of questionsToImport) {
        const questionPayload = {
          question: question.languages?.sv?.text ||
            question.question?.sv ||
            question.question,
          options: question.languages?.sv?.options ||
            question.options?.sv ||
            question.options || [],
          explanation: question.languages?.sv?.explanation ||
            question.explanation?.sv ||
            question.explanation,
        };

        const emojiOutcome = await runEmojiGenerationWithProviders(
            questionPayload,
            illustrationProviders,
            question.id,
            null,
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
          phase: "Genererar illustrationer",
          completed: emojiGeneratedCount + emojiFailedCount,
          total: questionsToImport.length,
          details: `${emojiGeneratedCount} illustrationer skapade, ` +
            `${emojiFailedCount} misslyckades`,
        });
      }
    }

    // Uppdatera progress med dublett-information
    const duplicateInfo = stats.duplicatesBlocked > 0 ?
            ` (${stats.duplicatesBlocked} dubletter blockerade)` :
            "";

    await safeUpdateProgress({
      phase: "Sparar frågor",
      completed: questionsToImport.length,
      total: amount,
      details: `Sparar ${questionsToImport.length} frågor till databasen${duplicateInfo}...`,
    });

    const batch = db.batch();
    questionsToImport.forEach((question) => {
      const docRef = db.collection("questions").doc(question.id);
      const questionData = {...question, createdAt: admin.firestore.FieldValue.serverTimestamp()};
      batch.set(docRef, questionData);
    });
    await batch.commit();

    logger.info("Queued AI generation import summary", {
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

    // Kör automatisk AI-validering på alla genererade frågor
    const validationProviders = await getProvidersForPurpose("validation");
    const canValidate = validationProviders.length > 0;

    await safeUpdateProgress({
      phase: "AI-validering",
      completed: canValidate ? 0 : questionsToImport.length,
      total: questionsToImport.length,
      details: canValidate ?
                "Kör AI-validering med alla providers..." :
                "Inga validation-providers aktiverade - hoppar över AI-validering",
    });

    let validationSuccessCount = 0;
    let validationFailedCount = 0;
    let validationSkippedCount = 0;

    if (!canValidate) {
      validationSkippedCount = questionsToImport.length;
      logger.warn(
          "Skipping AI validation for generated questions - " +
        "no validation providers available",
      );
    } else {
      for (const question of questionsToImport) {
        try {
          // Hämta frågedata från databasen
          const questionDoc = await db.collection("questions").doc(question.id).get();
          if (!questionDoc.exists) {
            logger.warn(`Question ${question.id} not found for validation`);
            validationFailedCount++;
            continue;
          }

          const questionData = questionDoc.data();
          const {languages, correctOption} = questionData;
          const questionText = languages?.sv?.text || "";
          const options = languages?.sv?.options || [];
          const explanation = languages?.sv?.explanation || "";

          // Kör validering med alla providers
          const validationResults = {};
          const reasoningSections = [];

          for (const {name, key} of validationProviders) {
            try {
              let result;
              if (name === "anthropic") {
                const {validateQuestion} =
                  require("./services/aiQuestionValidator");
                result = await validateQuestion(
                    {question: questionText, options, correctOption,
                      explanation},
                    key,
                );
              } else if (name === "gemini") {
                const {validateQuestion} =
                  require("./services/geminiQuestionValidator");
                result = await validateQuestion(
                    {question: questionText, options, correctOption,
                      explanation},
                    key,
                );
              } else if (name === "openai") {
                const {validateQuestion} =
                  require("./services/openaiQuestionValidator");
                result = await validateQuestion(
                    {question: questionText, options, correctOption,
                      explanation},
                    key,
                );
              }

              if (result) {
                validationResults[name] = result;
                if (typeof result.reasoning === "string" && result.reasoning.trim()) {
                  const providerLabel = name.charAt(0).toUpperCase() + name.slice(1);
                  reasoningSections.push(`**${providerLabel}:** ${result.reasoning}`);
                }
              }
            } catch (error) {
              logger.warn(
                  `${name} validation failed for question ${question.id}`,
                  {error: error.message},
              );
              validationResults[name] = {
                valid: null,
                error: error.message,
                unavailable: true,
              };
            }
          }

          // Beräkna konsensus
          const successfulProviders = Object.entries(validationResults)
              .filter(([, result]) => typeof result?.valid === "boolean");

          if (successfulProviders.length > 0) {
            const validProviders = successfulProviders.filter(
                ([, result]) => result.valid === true,
            );
            const invalidProviders = successfulProviders.filter(
                ([, result]) => result.valid === false,
            );
            const majorityValid =
              validProviders.length > invalidProviders.length;

            const issues = invalidProviders.flatMap(
                ([providerName, result]) => {
                  const providerLabel =
                    providerName.charAt(0).toUpperCase() +
                    providerName.slice(1);
                  if (Array.isArray(result.issues) &&
                      result.issues.length > 0) {
                    return result.issues.map(
                        (issue) => `[${providerLabel}] ${issue}`,
                    );
                  }
                  return [
                    `[${providerLabel}] AI-valideringen rapporterade ` +
                    `ett problem utan detaljer`,
                  ];
                });

            const finalResult = {
              valid: majorityValid,
              consensus: {
                valid: validProviders.length,
                invalid: invalidProviders.length,
                total: successfulProviders.length,
                method: "majority",
              },
              issues,
              reasoning: reasoningSections.join("\n\n").trim(),
              providerResults: validationResults,
              providersChecked: successfulProviders.length,
            };

            // Uppdatera frågan med validering
            await db.collection("questions").doc(question.id).update({
              aiValidated: true,
              aiValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
              aiValidationResult: finalResult,
            });

            validationSuccessCount++;
          } else {
            validationFailedCount++;
          }
        } catch (error) {
          logger.error(`Failed to validate question ${question.id}`, {error: error.message});
          validationFailedCount++;
        }

        await safeUpdateProgress({
          phase: "AI-validering",
          completed: validationSuccessCount + validationFailedCount,
          total: questionsToImport.length,
          details: `${validationSuccessCount} validerade, ${validationFailedCount} misslyckades`,
        });
      }
    }

    const result = {
      count: questionsToImport.length,
      provider: usedProvider,
      questionIds: questionsToImport.map((q) => q.id),
      validation: stats,
      emoji: {
        generated: emojiGeneratedCount,
        failed: emojiFailedCount,
        skipped: emojiSkippedCount,
      },
      aiValidation: {
        validated: validationSuccessCount,
        failed: validationFailedCount,
        skipped: validationSkippedCount,
      },
      details: {
        requested: amount,
        generated: questions.length,
        imported: questionsToImport.length,
        duplicatesBlocked: stats.duplicatesBlocked,
        invalidCount: stats.invalidCount,
        category: category || "Alla",
        ageGroup: ageGroup || "Blandad",
        emojiGenerated: emojiGeneratedCount,
        emojiFailed: emojiFailedCount,
        emojiSkipped: emojiSkippedCount,
        aiValidated: validationSuccessCount,
        aiValidationFailed: validationFailedCount,
        aiValidationSkipped: validationSkippedCount,
      },
    };

    // Bygg slutmeddelande med eventuell dublett-information och validering
    let finalDetails = stats.duplicatesBlocked > 0 ?
            `${questionsToImport.length} frågor importerade ` +
            `(${stats.duplicatesBlocked} dubletter blockerade)` :
            `${questionsToImport.length} frågor importerade`;
    if (emojiSkippedCount > 0) {
      finalDetails += " (Emoji-generering hoppades över)";
    } else if (emojiFailedCount > 0) {
      finalDetails += ` (${emojiFailedCount} illustrationer misslyckades)`;
    }
    if (validationSkippedCount > 0) {
      finalDetails += " (AI-validering hoppades över)";
    } else if (validationSuccessCount > 0) {
      finalDetails += ` (${validationSuccessCount} AI-validerade)`;
    }

    await taskDocRef.update({
      status: "completed",
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      result,
      progress: {
        phase: "Klar",
        completed: questionsToImport.length,
        total: amount,
        details: finalDetails,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
    logger.info(`Successfully completed AI generation task ${taskId}`);
  } catch (error) {
    logger.error(
        `Failed AI generation task ${taskId}`,
        {error: error.message, stack: error.stack},
    );
    await taskDocRef.update({
      status: "failed",
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: error.message,
      progress: {
        phase: "Misslyckades",
        completed: 0,
        total: amount,
        details: error.message,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
  }
});

exports.runaiemojiregeneration = onTaskDispatched(taskRuntimeDefaults, async (req) => {
  const {taskId} = req.data;
  const db = admin.firestore();
  const taskDocRef = db.collection("backgroundTasks").doc(taskId);

  const safeUpdateProgress = async ({phase = "", completed = 0, total = 0, details = ""}) => {
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(taskDocRef);
        if (!snapshot.exists) {
          throw new Error(`Task ${taskId} not found during progress update`);
        }

        const data = snapshot.data() || {};
        const status = data.status;
        if (["cancelled", "failed"].includes(status)) {
          return;
        }

        const nextProgress = {
          phase,
          completed: Math.max(0, completed),
          total: Math.max(0, total),
          details,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        transaction.update(taskDocRef, {progress: nextProgress});
      });
    } catch (progressError) {
      logger.warn(
          `Failed to update progress for emoji regeneration task ${taskId}`,
          {error: progressError.message},
      );
    }
  };

  try {
    await taskDocRef.update({
      status: "processing",
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      progress: {
        phase: "Initierar",
        completed: 0,
        total: 0,
        details: "Förbereder regenerering av illustrationer...",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
    logger.info(`Processing illustration regeneration task ${taskId}`);

    const illustrationProviders = await getProvidersForPurpose("illustration");
    if (illustrationProviders.length === 0) {
      throw new Error("No illustration providers are enabled and configured");
    }

    const questionsRef = db.collection("questions");
    const snapshot = await questionsRef.get();

    if (snapshot.empty) {
      throw new Error("No questions found in Firestore");
    }

    await safeUpdateProgress({
      phase: "Hämtar frågor",
      completed: 0,
      total: snapshot.size,
      details: `Hittade ${snapshot.size} frågor att uppdatera`,
    });

    let generatedCount = 0;
    let failedCount = 0;
    let processedCount = 0;
    const updates = [];

    const toArray = (value) => {
      if (Array.isArray(value)) {
        return value;
      }
      if (value && typeof value === "object") {
        return Object.values(value);
      }
      if (typeof value === "string" && value.trim().length > 0) {
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
                "";
      const questionText =
        typeof questionTextRaw === "string" &&
        questionTextRaw.trim().length > 0 ?
          questionTextRaw :
          "Okänd fråga från tidigare import";

      const rawOptions =
                data.languages?.sv?.options ??
                data.options?.sv ??
                data.options ??
                data.languages?.en?.options ??
                [];
      const normalizedOptions = toArray(rawOptions)
          .map((option) => (typeof option === "string" ? option : String(option ?? "")))
          .filter((option) => option.trim().length > 0);

      const explanationText =
                data.languages?.sv?.explanation ??
                data.explanation?.sv ??
                data.explanation ??
                data.languages?.en?.explanation ??
                "";

      const questionPayload = {
        question: questionText,
        options: normalizedOptions,
        explanation: explanationText,
      };

      const emojiOutcome = await runEmojiGenerationWithProviders(
          questionPayload,
          illustrationProviders,
          doc.id,
          null,
      );

      if (emojiOutcome) {
        updates.push({
          ref: doc.ref,
          data: {
            illustration: emojiOutcome.emoji,
            illustrationProvider: emojiOutcome.provider.name,
            illustrationGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        });
        generatedCount++;
      } else {
        failedCount++;
        logger.warn("All illustration providers failed to generate emoji for question " + doc.id);
      }

      processedCount++;
      await safeUpdateProgress({
        phase: "Regenererar illustrationer",
        completed: processedCount,
        total: snapshot.size,
        details: `${generatedCount} illustrationer uppdaterade, ${failedCount} misslyckades`,
      });
    }

    await safeUpdateProgress({
      phase: "Sparar ändringar",
      completed: snapshot.size,
      total: snapshot.size,
      details: `Sparar ${updates.length} uppdateringar till databasen...`,
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
      status: "completed",
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      result,
      progress: {
        phase: "Klar",
        completed: snapshot.size,
        total: snapshot.size,
        details: `${generatedCount} illustrationer uppdaterade, ${failedCount} misslyckades`,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
    logger.info(
        `Successfully completed illustration regeneration task ${taskId}`,
    );
  } catch (error) {
    logger.error(
        `Failed illustration regeneration task ${taskId}`,
        {error: error.message, stack: error.stack},
    );
    await taskDocRef.update({
      status: "failed",
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: error.message,
      progress: {
        phase: "Misslyckades",
        completed: 0,
        total: 0,
        details: error.message,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
  }
});

/**
 * Task-dispatched function to run AI question validation.
 */
exports.runaivalidation = onTaskDispatched(taskRuntimeDefaults, async (req) => {
  const {taskId, question, options, correctOption, explanation} = req.data;
  const db = admin.firestore();
  const taskDocRef = db.collection("backgroundTasks").doc(taskId);

  // Hämta provider settings
  const settings = await getProviderSettings();
  const validationSettings = settings.validation || {anthropic: true, openai: true, gemini: true};

  const anthropicKey = anthropicApiKey.value();
  const geminiKey = geminiApiKey.value();
  const openaiKey = openaiApiKey.value();
  const providerKeys = {
    anthropic: anthropicKey && validationSettings.anthropic !== false ? anthropicKey : null,
    gemini: geminiKey && validationSettings.gemini !== false ? geminiKey : null,
    openai: openaiKey && validationSettings.openai !== false ? openaiKey : null,
  };
  const enabledProviders = Object.entries(providerKeys)
      .filter(([, key]) => Boolean(key))
      .map(([name]) => name);

  if (enabledProviders.length === 0) {
    await taskDocRef.update({
      status: "failed",
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: "AI-valideringen avbröts: inga AI-leverantörer är konfigurerade.",
    });
    logger.error(`AI validation task ${taskId} aborted: no AI providers configured.`);
    return;
  }

  try {
    await taskDocRef.update({
      status: "processing",
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`Processing AI validation task ${taskId}`);

    const providerHealth = Object.fromEntries(
        enabledProviders.map((name) => [name, "unknown"]),
    );
    const formatProviderName = (provider) =>
      provider.charAt(0).toUpperCase() + provider.slice(1);

    const validationResults = {};
    const reasoningSections = [];
    let suggestedCorrectOption;

    if (anthropicKey) {
      try {
        const {validateQuestion} = require("./services/aiQuestionValidator");
        const result = await validateQuestion(
            {question, options, correctOption, explanation},
            anthropicKey,
        );
        validationResults.anthropic = result;
        providerHealth.anthropic = "healthy";
        if (typeof result.reasoning === "string" && result.reasoning.trim()) {
          reasoningSections.push(`**Anthropic:** ${result.reasoning}`);
        }
      } catch (error) {
        logger.error("Anthropic validation failed during task", {error: error.message});
        validationResults.anthropic = {
          valid: null,
          error: error.message,
          unavailable: true,
        };
        if (providerHealth.anthropic !== "healthy") {
          providerHealth.anthropic = "unavailable";
        }
      }
    }

    if (geminiKey) {
      try {
        const {validateQuestion} =
          require("./services/geminiQuestionValidator");
        const result = await validateQuestion(
            {question, options, correctOption, explanation},
            geminiKey,
        );
        validationResults.gemini = result;
        providerHealth.gemini = "healthy";
        if (typeof result.reasoning === "string" && result.reasoning.trim()) {
          reasoningSections.push(`**Gemini:** ${result.reasoning}`);
        }
      } catch (error) {
        logger.error("Gemini validation failed during task", {error: error.message});
        validationResults.gemini = {
          valid: null,
          error: error.message,
          unavailable: true,
        };
        if (providerHealth.gemini !== "healthy") {
          providerHealth.gemini = "unavailable";
        }
      }
    }

    if (openaiKey) {
      try {
        const {validateQuestion} =
          require("./services/openaiQuestionValidator");
        const result = await validateQuestion(
            {question, options, correctOption, explanation},
            openaiKey,
        );
        validationResults.openai = result;
        providerHealth.openai = "healthy";
        if (typeof result.reasoning === "string" && result.reasoning.trim()) {
          reasoningSections.push(`**OpenAI:** ${result.reasoning}`);
        }
      } catch (error) {
        logger.error("OpenAI validation failed during task", {error: error.message});
        validationResults.openai = {
          valid: null,
          error: error.message,
          unavailable: true,
        };
        if (providerHealth.openai !== "healthy") {
          providerHealth.openai = "unavailable";
        }
      }
    }

    const successfulProviders = Object.entries(validationResults)
        .filter(([, result]) => typeof result?.valid === "boolean");

    if (successfulProviders.length === 0) {
      if (enabledProviders.every((name) => providerHealth[name] === "unavailable")) {
        throw new Error("AI-valideringen avbröts: inga AI-leverantörer är tillgängliga just nu.");
      }

      const providerErrors = Object.entries(validationResults)
          .filter(([, result]) => result?.error)
          .map(([providerName, result]) => `[${formatProviderName(providerName)}] ${result.error}`);

      const failureResult = {
        valid: false,
        issues: providerErrors.length > 0 ?
                    providerErrors :
                    ["AI-valideringen kunde inte genomföras för frågan."],
        reasoning: "",
        providerResults: validationResults,
        providersChecked: 0,
      };

      await taskDocRef.update({
        status: "failed",
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: failureResult.issues.join(" | "),
        result: failureResult,
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
        method: "majority",
      },
      issues,
      reasoning: reasoningSections.join("\n\n").trim(),
      providerResults: validationResults,
      providersChecked: successfulProviders.length,
    };

    if (suggestedCorrectOption !== undefined) {
      finalResult.suggestedCorrectOption = suggestedCorrectOption;
    }

    if (Object.values(validationResults).some((result) => result?.error && !result?.valid)) {
      finalResult.providerErrors = Object.entries(validationResults)
          .filter(([, result]) => result?.error)
          .map(([providerName, result]) => ({
            provider: formatProviderName(providerName),
            error: result.error,
          }));
    }

    await taskDocRef.update({
      status: "completed",
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      result: finalResult,
    });
    logger.info(`Successfully completed AI validation task ${taskId}`);
  } catch (error) {
    logger.error(
        `Failed AI validation task ${taskId}`,
        {error: error.message, stack: error.stack},
    );
    await taskDocRef.update({
      status: "failed",
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: error.message,
    });
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
      const idToken = req.headers.authorization?.split("Bearer ")[1];
      if (!idToken) {
        return res.status(401).json({error: "Unauthorized: No token provided"});
      }

      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      const {questions} = req.body;

      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({error: "questions must be a non-empty array"});
      }

      // Validate each question has required fields
      for (const q of questions) {
        if (!q.id || !q.question || !q.options || q.correctOption === undefined || !q.explanation) {
          return res.status(400).json({
            error: "Each question must have: id, question, options, correctOption, explanation",
          });
        }
      }

      const taskId = await enqueueTask("batchvalidation", {questions}, userId);

      res.status(202).json({
        success: true,
        message: `Batch validation of ${questions.length} questions has been queued.`,
        taskId: taskId,
        questionCount: questions.length,
      });
    } catch (error) {
      logger.error(
          "Error queueing batch question validation",
          {error: error.message, stack: error.stack},
      );
      if (error.code === "auth/id-token-expired" ||
          error.code === "auth/argument-error") {
        return res.status(401).json({error: "Unauthorized: Invalid token"});
      }
      res.status(500).json({
        error: "Failed to queue batch validation task.",
        message: error.message,
      });
    }
  });
});

/**
 * Task-dispatched function to run batch AI question validation.
 */
exports.runaibatchvalidation = onTaskDispatched(taskRuntimeDefaults, async (req) => {
  const {taskId, questions} = req.data;
  const db = admin.firestore();
  const taskDocRef = db.collection("backgroundTasks").doc(taskId);

  const safeUpdateProgress = async ({completed = 0, validated = 0, failed = 0}) => {
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(taskDocRef);
        if (!snapshot.exists) {
          throw new Error(`Task ${taskId} not found during progress update`);
        }

        const data = snapshot.data() || {};
        const status = data.status;
        if (["cancelled", "failed"].includes(status)) {
          return;
        }

        const currentProgress = data.progress || {};
        const nextProgress = {
          total: questions.length,
          completed: Math.max(currentProgress.completed ?? 0, completed),
          validated: Math.max(currentProgress.validated ?? 0, validated),
          failed: Math.max(currentProgress.failed ?? 0, failed),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        transaction.update(taskDocRef, {progress: nextProgress});
      });
    } catch (progressError) {
      logger.warn(
          `Failed to update progress for batch task ${taskId}`,
          {error: progressError.message},
      );
    }
  };

  // Hämta provider settings
  const settings = await getProviderSettings();
  const validationSettings = settings.validation || {anthropic: true, openai: true, gemini: true};

  const anthropicKey = anthropicApiKey.value();
  const geminiKey = geminiApiKey.value();
  const openaiKey = openaiApiKey.value();
  const providerKeys = {
    anthropic: anthropicKey && validationSettings.anthropic !== false ? anthropicKey : null,
    gemini: geminiKey && validationSettings.gemini !== false ? geminiKey : null,
    openai: openaiKey && validationSettings.openai !== false ? openaiKey : null,
  };
  const enabledProviders = Object.entries(providerKeys)
      .filter(([, key]) => Boolean(key))
      .map(([name]) => name);

  if (enabledProviders.length === 0) {
    await taskDocRef.update({
      status: "failed",
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: "AI-valideringen avbröts: inga AI-leverantörer är konfigurerade.",
    });
    logger.error(`Batch validation task ${taskId} aborted: no AI providers configured.`);
    return;
  }

  try {
    await taskDocRef.update({
      status: "processing",
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      progress: {
        total: questions.length,
        completed: 0,
        validated: 0,
        failed: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    logger.info(`Processing batch AI validation task ${taskId}`, {questionCount: questions.length});

    const results = [];
    let completedCount = 0;
    let validatedCount = 0;
    let failedCount = 0;

    const providerHealth = Object.fromEntries(enabledProviders.map((name) => [name, "unknown"]));
    const formatProviderName = (provider) => provider.charAt(0).toUpperCase() + provider.slice(1);

    // Process each question
    for (const questionData of questions) {
      try {
        const {id, question, options, correctOption, explanation} = questionData;

        const validationResults = {};
        const reasoningSections = [];
        let suggestedCorrectOption;

        if (anthropicKey) {
          try {
            const {validateQuestion} =
              require("./services/aiQuestionValidator");
            const result = await validateQuestion(
                {question, options, correctOption, explanation},
                anthropicKey,
            );
            validationResults.anthropic = result;
            providerHealth.anthropic = "healthy";
            if (typeof result.reasoning === "string" && result.reasoning.trim()) {
              reasoningSections.push(`**Anthropic:** ${result.reasoning}`);
            }
          } catch (error) {
            logger.error(
                `Anthropic validation failed for question ${id}`,
                {error: error.message},
            );
            validationResults.anthropic = {
              valid: null,
              error: error.message,
              unavailable: true,
            };
            if (providerHealth.anthropic !== "healthy") {
              providerHealth.anthropic = "unavailable";
            }
          }
        }

        if (geminiKey) {
          try {
            const {validateQuestion} =
              require("./services/geminiQuestionValidator");
            const result = await validateQuestion(
                {question, options, correctOption, explanation},
                geminiKey,
            );
            validationResults.gemini = result;
            providerHealth.gemini = "healthy";
            if (typeof result.reasoning === "string" &&
                result.reasoning.trim()) {
              reasoningSections.push(`**Gemini:** ${result.reasoning}`);
            }
          } catch (error) {
            logger.error(
                `Gemini validation failed for question ${id}`,
                {error: error.message},
            );
            validationResults.gemini = {
              valid: null,
              error: error.message,
              unavailable: true,
            };
            if (providerHealth.gemini !== "healthy") {
              providerHealth.gemini = "unavailable";
            }
          }
        }

        if (openaiKey) {
          try {
            const {validateQuestion} =
              require("./services/openaiQuestionValidator");
            const result = await validateQuestion(
                {question, options, correctOption, explanation},
                openaiKey,
            );
            validationResults.openai = result;
            providerHealth.openai = "healthy";
            if (typeof result.reasoning === "string" &&
                result.reasoning.trim()) {
              reasoningSections.push(`**OpenAI:** ${result.reasoning}`);
            }
          } catch (error) {
            logger.error(
                `OpenAI validation failed for question ${id}`,
                {error: error.message},
            );
            validationResults.openai = {
              valid: null,
              error: error.message,
              unavailable: true,
            };
            if (providerHealth.openai !== "healthy") {
              providerHealth.openai = "unavailable";
            }
          }
        }

        const successfulProviders = Object.entries(validationResults)
            .filter(([, result]) => typeof result?.valid === "boolean");

        if (successfulProviders.length === 0) {
          if (enabledProviders.every((name) => providerHealth[name] === "unavailable")) {
            throw new Error("AI-valideringen avbröts: inga AI-leverantörer är tillgängliga just nu.");
          }

          const providerErrors = Object.entries(validationResults)
              .filter(([, result]) => result?.error)
              .map(([providerName, result]) => `[${formatProviderName(providerName)}] ${result.error}`);

          completedCount++;
          failedCount++;

          await safeUpdateProgress({
            completed: completedCount,
            validated: validatedCount,
            failed: failedCount,
          });
          logger.info(
              `Batch validation progress ${taskId}: ` +
              `${completedCount}/${questions.length} ` +
              `(${validatedCount} godkända, ${failedCount} underkända)`,
          );

          results.push({
            questionId: id,
            valid: false,
            issues: providerErrors.length > 0 ?
                            providerErrors :
                            ["AI-valideringen kunde inte genomföras för frågan."],
            reasoning: "",
            providerResults: validationResults,
            providersChecked: successfulProviders.length,
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
        const reasoning = reasoningSections.join("\n\n").trim();

        completedCount++;
        if (questionValid) {
          validatedCount++;
        } else {
          failedCount++;
        }

        await safeUpdateProgress({
          completed: completedCount,
          validated: validatedCount,
          failed: failedCount,
        });
        logger.info(
            `Batch validation progress ${taskId}: ` +
            `${completedCount}/${questions.length} ` +
            `(${validatedCount} godkända, ${failedCount} underkända)`,
        );

        const questionResult = {
          questionId: id,
          valid: questionValid,
          consensus: {
            valid: validProviders.length,
            invalid: invalidProviders.length,
            total: successfulProviders.length,
            method: "majority",
          },
          issues,
          reasoning,
          providerResults: validationResults,
          providersChecked: successfulProviders.length,
        };

        if (suggestedCorrectOption !== undefined) {
          questionResult.suggestedCorrectOption = suggestedCorrectOption;
        }

        if (Object.values(validationResults).some((result) => result?.error && !result?.valid)) {
          questionResult.providerErrors = Object.entries(validationResults)
              .filter(([, result]) => result?.error)
              .map(([providerName, result]) => ({
                provider: formatProviderName(providerName),
                error: result.error,
              }));
        }

        // SPARA RESULTATET TILL FIRESTORE-FRÅGEDOKUMENTET
        try {
          const questionRef = db.collection("questions").doc(id);
          await questionRef.update({
            aiValidated: questionValid,
            ...(questionValid ? {
              aiValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
            } : {}),
            aiValidationResult: questionResult,
          });
          logger.info(
              `Updated question ${id} with validation result: ` +
            `${questionValid ? "valid" : "invalid"}`,
          );
        } catch (updateError) {
          logger.error(
              `Failed to update question ${id} with validation result`,
              {error: updateError.message},
          );
          // Continue processing even if update fails
        }

        results.push(questionResult);
      } catch (error) {
        logger.error(`Failed to validate question in batch ${taskId}`, {error: error.message});
        results.push({
          questionId: questionData.id,
          valid: false,
          issues: [`Systemfel: ${error.message}`],
          providerResults: {},
          providersChecked: 0,
        });
        completedCount++;
        failedCount++;

        await safeUpdateProgress({
          completed: completedCount,
          validated: validatedCount,
          failed: failedCount,
        });
        logger.info(
            `Batch validation progress ${taskId}: ` +
          `${completedCount}/${questions.length} ` +
          `(${validatedCount} godkända, ${failedCount} underkända)`,
        );
      }
    }

    const finalResult = {
      total: questions.length,
      validated: validatedCount,
      failed: failedCount,
      results: results,
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const updates = {progress: nextProgress};
      if (data.status !== "completed" && data.status !== "failed" && data.status !== "cancelled") {
        updates.status = "completed";
        updates.finishedAt = admin.firestore.FieldValue.serverTimestamp();
        updates.result = finalResult;
      } else if (!data.result) {
        updates.result = finalResult;
      }

      transaction.update(taskDocRef, updates);
    });

    logger.info(
        `Successfully completed batch AI validation task ${taskId}`,
        {validated: validatedCount, failed: failedCount},
    );
  } catch (error) {
    logger.error(
        `Failed batch AI validation task ${taskId}`,
        {error: error.message, stack: error.stack},
    );
    await taskDocRef.update({
      status: "failed",
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: error.message,
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
      const idToken = req.headers.authorization?.split("Bearer ")[1];
      if (!idToken) {
        return res.status(401).json({error: "Unauthorized: No token provided"});
      }

      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userId = decodedToken.uid;

      const {questionIds} = req.body;

      if (!Array.isArray(questionIds) || questionIds.length === 0) {
        return res.status(400).json({error: "questionIds must be a non-empty array"});
      }

      const taskId = await enqueueTask("batchregenerateemojis", {questionIds}, userId);

      res.status(202).json({
        success: true,
        message: `Batch emoji regeneration of ${questionIds.length} questions has been queued.`,
        taskId: taskId,
        questionCount: questionIds.length,
      });
    } catch (error) {
      logger.error(
          "Error queueing batch emoji regeneration",
          {error: error.message, stack: error.stack},
      );
      if (error.code === "auth/id-token-expired" ||
          error.code === "auth/argument-error") {
        return res.status(401).json({error: "Unauthorized: Invalid token"});
      }
      res.status(500).json({
        error: "Failed to queue batch emoji regeneration task.",
        message: error.message,
      });
    }
  });
});

/**
 * Task-dispatched function to run batch emoji regeneration.
 */
exports.runaibatchregenerateemojis = onTaskDispatched(taskRuntimeDefaults, async (req) => {
  const {taskId, questionIds} = req.data;
  const db = admin.firestore();
  const taskDocRef = db.collection("backgroundTasks").doc(taskId);

  const safeUpdateProgress = async ({phase = "", completed = 0, total = 0, details = ""}) => {
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(taskDocRef);
        if (!snapshot.exists) {
          throw new Error(`Task ${taskId} not found during progress update`);
        }
        const data = snapshot.data() || {};
        if (["cancelled", "failed", "completed"].includes(data.status)) {
          return;
        }
        const nextProgress = {
          phase,
          completed,
          total,
          details,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        transaction.update(taskDocRef, {progress: nextProgress});
      });
    } catch (progressError) {
      logger.warn(
          `Failed to update progress for batch emoji task ${taskId}`,
          {error: progressError.message},
      );
    }
  };

  try {
    await taskDocRef.update({
      status: "processing",
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      progress: {
        phase: "Initierar",
        completed: 0,
        total: questionIds.length,
        details: "Förbereder regenerering av emojis...",
      },
    });

    const illustrationProviders = await getProvidersForPurpose(
        "illustration",
    );
    if (illustrationProviders.length === 0) {
      throw new Error("No illustration providers are enabled and configured");
    }

    let generatedCount = 0;
    let failedCount = 0;
    const updates = [];

    const questionRefs = questionIds.map(
        (id) => db.collection("questions").doc(id),
    );
    const questionSnapshots = await db.getAll(...questionRefs);

    await safeUpdateProgress({
      phase: "Hämtar frågor",
      completed: 0,
      total: questionIds.length,
      details: `Hittade ${questionSnapshots.length} frågor att uppdatera`,
    });

    const toArray = (value) => {
      if (Array.isArray(value)) return value;
      if (value && typeof value === "object") return Object.values(value);
      if (typeof value === "string" && value.trim().length > 0) return [value];
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
        question: data.languages?.sv?.text || data.question?.sv ||
          data.question || data.text || "",
        options: toArray(
            data.languages?.sv?.options || data.options?.sv ||
          data.options || [],
        ),
        explanation: data.languages?.sv?.explanation ||
          data.explanation?.sv || data.explanation || "",
      };

      const emojiOutcome = await runEmojiGenerationWithProviders(
          questionPayload,
          illustrationProviders,
          doc.id,
          null,
      );

      if (emojiOutcome) {
        updates.push({
          ref: doc.ref,
          data: {
            illustration: emojiOutcome.emoji,
            illustrationProvider: emojiOutcome.provider.name,
            illustrationGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        });
        generatedCount++;
      } else {
        failedCount++;
        logger.warn(
            "All illustration providers failed to generate emoji " +
          "for question " + doc.id,
        );
      }
      await safeUpdateProgress({
        phase: "Regenererar emojis",
        completed: generatedCount + failedCount,
        total: questionIds.length,
        details: `${generatedCount} emojis uppdaterade, ` +
          `${failedCount} misslyckades`,
      });
    }

    await safeUpdateProgress({
      phase: "Sparar ändringar",
      completed: questionIds.length,
      total: questionIds.length,
      details: `Sparar ${updates.length} uppdateringar...`,
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
      total: questionIds.length,
    };
    await taskDocRef.update({
      status: "completed",
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      result,
      progress: {
        phase: "Klar",
        completed: questionIds.length,
        total: questionIds.length,
        details: `${generatedCount} emojis uppdaterade, ` +
          `${failedCount} misslyckades`,
      },
    });
    logger.info(
        `Successfully completed batch emoji regeneration task ${taskId}`,
    );
  } catch (error) {
    logger.error(
        `Failed batch emoji regeneration task ${taskId}`,
        {error: error.message, stack: error.stack},
    );
    await taskDocRef.update({
      status: "failed",
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: error.message,
      progress: {phase: "Misslyckades", details: error.message},
    });
  }
});

// ============================================================================
// ADMIN HANDLERS (Inline for now - to be refactored)
// ============================================================================

/**
 * One-time function to update all existing questions with createdAt field
 * Call this once: https://europe-west1-geoquest2-7e45c.cloudfunctions.net/updateQuestionsCreatedAt
 */

