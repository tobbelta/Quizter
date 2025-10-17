/**
 * Question Import Scheduled Task
 * Automatically generates questions every 6 hours using AI providers
 */
const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const {initializeFirebase} = require("../config/firebase");
const {REGION, anthropicApiKey, openaiApiKey, geminiApiKey} =
  require("../config/runtime");
const {selectRandomProvider} = require("../utils/providers");
const {enqueueTask} = require("../utils/cloudTasks");
const {
  prepareQuestionsForImport,
  loadExistingQuestions,
} = require("../services/questionImportService");

const admin = initializeFirebase();

const questionImport = onSchedule(
    {
      schedule: "every 6 hours",
      region: REGION,
      secrets: [anthropicApiKey, openaiApiKey, geminiApiKey],
    },
    async (event) => {
      logger.info("questionImport trigger executed", {
        timestamp: event.scheduleTime,
      });

      try {
        const allQuestions = [];
        const providerUsage = {anthropic: 0, openai: 0, gemini: 0};
        const totalQuestionsToGenerate = 20;
        const questionsPerBatch = 5;
        const batches = Math.ceil(totalQuestionsToGenerate / questionsPerBatch);

        for (let i = 0; i < batches; i++) {
          const provider = await selectRandomProvider("generation");

          if (!provider) {
            logger.warn(
                "No AI providers enabled for generation, " +
              "skipping automatic question import",
            );
            return;
          }

          try {
            const questions = await provider.generator(
                {amount: questionsPerBatch},
                provider.key,
            );
            if (questions && questions.length > 0) {
              allQuestions.push(...questions);
              providerUsage[provider.name] += questions.length;
              logger.info(
                  `Batch ${i + 1}/${batches}: Generated ${
                    questions.length} questions with ${provider.name}`,
              );
            }
          } catch (error) {
            logger.warn(
                `Failed to generate with ${provider.name} in batch ${i + 1}`,
                {
                  error: error.message,
                },
            );
          }
        }

        if (allQuestions.length === 0) {
          logger.warn("No questions generated from any provider");
          return;
        }

        const questions = allQuestions;
        const usedProvider = "mixed";

        // Spara till Firestore
        const db = admin.firestore();
        const existingQuestions = await loadExistingQuestions(db);
        const {questionsToImport, stats} = prepareQuestionsForImport(
            questions,
            existingQuestions,
        );

        if (questionsToImport.length === 0) {
          logger.warn(
              "No questions imported efter validering/dublettkontroll",
              {
                provider: usedProvider,
                totalIncoming: stats.totalIncoming,
                duplicatesBlocked: stats.duplicatesBlocked,
                invalidCount: stats.invalidCount,
              },
          );
          return;
        }

        const batch = db.batch();

        questionsToImport.forEach((question) => {
          const docRef = db.collection("questions").doc(question.id);
          const questionData = {
            ...question,
            createdAt:
            question.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          };
          batch.set(docRef, questionData);
        });

        await batch.commit();

        logger.info("Successfully imported AI-generated questions", {
          count: questionsToImport.length,
          provider: usedProvider,
          providerUsage,
          timestamp: event.scheduleTime,
          validation: stats,
        });

        // Queue AI validation
        try {
          const questionsForValidation = questionsToImport.map((q) => ({
            id: q.id,
            question: q.languages?.sv?.text || q.question?.sv || "",
            options: q.languages?.sv?.options || q.options?.sv || [],
            correctOption: q.correctOption || 0,
            explanation: q.languages?.sv?.explanation || q.explanation?.sv || "",
          }));

          if (questionsForValidation.length > 0) {
            const taskId = await enqueueTask(
                "batchvalidation",
                {
                  questions: questionsForValidation,
                },
                "system",
            );

            logger.info(
                `Queued AI validation for ${
                  questionsForValidation.length} imported questions`,
                {
                  taskId,
                  count: questionsForValidation.length,
                },
            );
          }
        } catch (validationError) {
          logger.warn(
              "Failed to queue AI validation for imported questions",
              {
                error: validationError.message,
              },
          );
        }

        // Create notification
        try {
          const notificationRef = db.collection("notifications").doc();

          let providerMessage = "";
          if (usedProvider === "mixed") {
            const usedProviders = Object.entries(providerUsage)
                .filter(([, count]) => count > 0)
                .map(
                    ([name, count]) =>
                      `${name.charAt(0).toUpperCase() + name.slice(1)} (${count})`,
                )
                .join(", ");
            providerMessage = `blandade providers: ${usedProviders}`;
          } else {
            providerMessage =
            usedProvider === "anthropic" ?
              "Anthropic Claude" :
              usedProvider === "openai" ?
              "OpenAI" :
              "Google Gemini";
          }

          await notificationRef.set({
            type: "question_import",
            title: "Automatisk frågegenerering slutförd",
            message: `${questionsToImport.length} nya frågor har ` +
            `genererats med ${providerMessage}`,
            data: {
              count: questionsToImport.length,
              provider: usedProvider,
              providerUsage,
              model: questionsToImport[0]?.source || "ai-generated",
              timestamp: new Date().toISOString(),
            },
            targetAudience: "superusers",
            read: false,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          });
          logger.info("Notification created for superusers");
        } catch (notificationError) {
          logger.error("Failed to create notification", {
            error: notificationError.message,
          });
        }
      } catch (error) {
        logger.error("Failed to import questions", {
          error: error.message,
          stack: error.stack,
        });

        // Create error notification
        try {
          const db = admin.firestore();
          const notificationRef = db.collection("notifications").doc();
          await notificationRef.set({
            type: "question_import_error",
            title: "Automatisk frågegenerering misslyckades",
            message: `Kunde inte generera frågor: ${error.message}`,
            data: {
              error: error.message,
              timestamp: new Date().toISOString(),
            },
            targetAudience: "superusers",
            read: false,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          });
          logger.info("Error notification created for superusers");
        } catch (notificationError) {
          logger.error("Failed to create error notification", {
            error: notificationError.message,
          });
        }
      }
    },
);

module.exports = questionImport;
