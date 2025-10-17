const {onTaskDispatched} = require("firebase-functions/v2/tasks");
const logger = require("firebase-functions/logger");
const {initializeFirebase, admin} = require("../config/firebase");
const {
  taskRuntimeDefaults,
  anthropicApiKey,
  geminiApiKey,
  openaiApiKey,
} = require("../config/runtime");
const {getProviderSettings} = require("../utils/providers");
const {enqueueTask} = require("../utils/cloudTasks");

initializeFirebase();
module.exports = onTaskDispatched(taskRuntimeDefaults, async (req) => {
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
                        const { validateQuestion } = require('../services/aiQuestionValidator');
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
                        const { validateQuestion } = require('../services/geminiQuestionValidator');
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
                        const { validateQuestion } = require('../services/openaiQuestionValidator');
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
