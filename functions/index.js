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
const {initializeFirebase} = require("./config/firebase");
const runAIGeneration = require("./tasks/runAIGeneration");
const runAIEmojiRegeneration = require("./tasks/runAIEmojiRegeneration");
const runAIValidation = require("./tasks/runAIValidation");
const runAIBatchValidation = require("./tasks/runAIBatchValidation");
const runAIBatchRegenerateEmojis =
  require("./tasks/runAIBatchRegenerateEmojis");
const runAIMigration = require("./tasks/runAIMigration");

initializeFirebase();

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
// BACKGROUND TASKS - Task-dispatched functions
// ============================================================================

exports.runaigeneration = runAIGeneration;
exports.runaiemojiregeneration = runAIEmojiRegeneration;
exports.runaivalidation = runAIValidation;
exports.runaibatchvalidation = runAIBatchValidation;
exports.runaibatchregenerateemojis = runAIBatchRegenerateEmojis;
exports.runaimigration = runAIMigration;
