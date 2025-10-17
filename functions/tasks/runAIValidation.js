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
                const { validateQuestion } = require('../services/aiQuestionValidator');
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
                const { validateQuestion } = require('../services/geminiQuestionValidator');
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
                const { validateQuestion } = require('../services/openaiQuestionValidator');
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
