const {onTaskDispatched} = require("firebase-functions/v2/tasks");
const logger = require("firebase-functions/logger");
const {initializeFirebase, admin} = require("../config/firebase");
const {
  taskRuntimeDefaults,
  anthropicApiKey,
  geminiApiKey,
  openaiApiKey,
} = require("../config/runtime");
const {
  selectRandomProvider,
  getProvidersForPurpose,
} = require("../utils/providers");
const {
  runEmojiGenerationWithProviders,
} = require("../utils/helpers");
const {enqueueTask} = require("../utils/cloudTasks");
const {
  loadExistingQuestions,
  prepareQuestionsForImport,
} = require("../services/questionImportService");

initializeFirebase();
module.exports = onTaskDispatched(taskRuntimeDefaults, async (req) => {
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

        // Default targetAudience to 'swedish' - AI will decide if youth questions should be international
        const targetAudience = 'swedish';

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
            questions = await randomProvider.generator({ amount, category, ageGroup, targetAudience }, randomProvider.key);
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
                const { generateQuestions: generateWithGemini } = require('../services/geminiQuestionGenerator');
                questions = await generateWithGemini({ amount, category, ageGroup, targetAudience }, geminiKey);
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
                const { generateQuestions: generateWithOpenAI } = require('../services/openaiQuestionGenerator');
                questions = await generateWithOpenAI({ amount, category, ageGroup, targetAudience }, openaiKey);
                usedProvider = 'openai';
            }
        } else if (anthropicKey) {
            await safeUpdateProgress({
                phase: 'Genererar frågor',
                completed: 0,
                total: amount,
                details: 'Använder Anthropic...'
            });
            const { generateQuestions: generateWithAnthropic } = require('../services/aiQuestionGenerator');
            questions = await generateWithAnthropic({ amount, category, ageGroup, targetAudience }, anthropicKey);
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

        // Kör automatisk AI-validering på alla genererade frågor
        const validationProviders = await getProvidersForPurpose('validation');
        const canValidate = validationProviders.length > 0;

        await safeUpdateProgress({
            phase: 'AI-validering',
            completed: canValidate ? 0 : questionsToImport.length,
            total: questionsToImport.length,
            details: canValidate
                ? 'Kör AI-validering med alla providers...'
                : 'Inga validation-providers aktiverade - hoppar över AI-validering'
        });

        let validationSuccessCount = 0;
        let validationFailedCount = 0;
        let validationSkippedCount = 0;

        if (!canValidate) {
            validationSkippedCount = questionsToImport.length;
            logger.warn('Skipping AI validation for generated questions - no validation providers available');
        } else {
            for (const question of questionsToImport) {
                try {
                    // Hämta frågedata från databasen
                    const questionDoc = await db.collection('questions').doc(question.id).get();
                    if (!questionDoc.exists) {
                        logger.warn(`Question ${question.id} not found for validation`);
                        validationFailedCount++;
                        continue;
                    }

                    const questionData = questionDoc.data();
                    const { languages, correctOption } = questionData;
                    const questionText = languages?.sv?.text || '';
                    const options = languages?.sv?.options || [];
                    const explanation = languages?.sv?.explanation || '';

                    // Kör validering med alla providers
                    const validationResults = {};
                    const reasoningSections = [];

                    for (const { name, key } of validationProviders) {
                        try {
                            let result;
                            if (name === 'anthropic') {
                                const { validateQuestion } = require('../services/aiQuestionValidator');
                                result = await validateQuestion({ question: questionText, options, correctOption, explanation }, key);
                            } else if (name === 'gemini') {
                                const { validateQuestion } = require('../services/geminiQuestionValidator');
                                result = await validateQuestion({ question: questionText, options, correctOption, explanation }, key);
                            } else if (name === 'openai') {
                                const { validateQuestion } = require('../services/openaiQuestionValidator');
                                result = await validateQuestion({ question: questionText, options, correctOption, explanation }, key);
                            }

                            if (result) {
                                validationResults[name] = result;
                                if (typeof result.reasoning === 'string' && result.reasoning.trim()) {
                                    const providerLabel = name.charAt(0).toUpperCase() + name.slice(1);
                                    reasoningSections.push(`**${providerLabel}:** ${result.reasoning}`);
                                }
                            }
                        } catch (error) {
                            logger.warn(`${name} validation failed for question ${question.id}`, { error: error.message });
                            validationResults[name] = {
                                valid: null,
                                error: error.message,
                                unavailable: true
                            };
                        }
                    }

                    // Beräkna konsensus
                    const successfulProviders = Object.entries(validationResults)
                        .filter(([, result]) => typeof result?.valid === 'boolean');

                    if (successfulProviders.length > 0) {
                        const validProviders = successfulProviders.filter(([, result]) => result.valid === true);
                        const invalidProviders = successfulProviders.filter(([, result]) => result.valid === false);
                        const majorityValid = validProviders.length > invalidProviders.length;

                        const issues = invalidProviders.flatMap(([providerName, result]) => {
                            const providerLabel = providerName.charAt(0).toUpperCase() + providerName.slice(1);
                            if (Array.isArray(result.issues) && result.issues.length > 0) {
                                return result.issues.map((issue) => `[${providerLabel}] ${issue}`);
                            }
                            return [`[${providerLabel}] AI-valideringen rapporterade ett problem utan detaljer`];
                        });

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

                        // Uppdatera frågan med validering
                        await db.collection('questions').doc(question.id).update({
                            aiValidated: true,
                            aiValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
                            aiValidationResult: finalResult
                        });

                        validationSuccessCount++;
                    } else {
                        validationFailedCount++;
                    }
                } catch (error) {
                    logger.error(`Failed to validate question ${question.id}`, { error: error.message });
                    validationFailedCount++;
                }

                await safeUpdateProgress({
                    phase: 'AI-validering',
                    completed: validationSuccessCount + validationFailedCount,
                    total: questionsToImport.length,
                    details: `${validationSuccessCount} validerade, ${validationFailedCount} misslyckades`
                });
            }
        }

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
            aiValidation: {
                validated: validationSuccessCount,
                failed: validationFailedCount,
                skipped: validationSkippedCount
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
                emojiSkipped: emojiSkippedCount,
                aiValidated: validationSuccessCount,
                aiValidationFailed: validationFailedCount,
                aiValidationSkipped: validationSkippedCount
            }
        };

        // Bygg slutmeddelande med eventuell dublett-information och validering
        let finalDetails = stats.duplicatesBlocked > 0
            ? `${questionsToImport.length} frågor importerade (${stats.duplicatesBlocked} dubletter blockerade)`
            : `${questionsToImport.length} frågor importerade`;
        if (emojiSkippedCount > 0) {
            finalDetails += ' (Emoji-generering hoppades över)';
        } else if (emojiFailedCount > 0) {
            finalDetails += ` (${emojiFailedCount} illustrationer misslyckades)`;
        }
        if (validationSkippedCount > 0) {
            finalDetails += ' (AI-validering hoppades över)';
        } else if (validationSuccessCount > 0) {
            finalDetails += ` (${validationSuccessCount} AI-validerade)`;
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



