const {onTaskDispatched} = require("firebase-functions/v2/tasks");
const logger = require("firebase-functions/logger");
const {initializeFirebase, admin} = require("../config/firebase");
const {taskRuntimeDefaults} = require("../config/runtime");
const {getProvidersForPurpose} = require("../utils/providers");
const {runEmojiGenerationWithProviders} = require("../utils/helpers");

initializeFirebase();
module.exports = onTaskDispatched(taskRuntimeDefaults, async (req) => {
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
