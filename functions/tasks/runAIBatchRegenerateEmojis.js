const {onTaskDispatched} = require("firebase-functions/v2/tasks");
const logger = require("firebase-functions/logger");
const {initializeFirebase, admin} = require("../config/firebase");
const {taskRuntimeDefaults} = require("../config/runtime");
const {getProvidersForPurpose} = require("../utils/providers");
const {runEmojiGenerationWithProviders} = require("../utils/helpers");

initializeFirebase();
module.exports = onTaskDispatched(taskRuntimeDefaults, async (req) => {
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
