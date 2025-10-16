/**
 * Runtime configuration and secrets for Cloud Functions
 */
const {defineSecret} = require("firebase-functions/params");

// Region and project constants
const REGION = "europe-west1";
const PROJECT_ID = "geoquest2-7e45c";

// Secret definitions
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const openaiApiKey = defineSecret("OPENAI_API_KEY");
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Default runtime options for HTTPS functions
const runtimeDefaults = {
  region: REGION,
  memory: "512MB",
  timeoutSeconds: 60,
  secrets: [anthropicApiKey, openaiApiKey, geminiApiKey, stripeSecretKey],
};

// Default runtime options for background tasks (longer timeout)
const taskRuntimeDefaults = {
  ...runtimeDefaults,
  timeoutSeconds: 540,
};

module.exports = {
  REGION,
  PROJECT_ID,
  stripeSecretKey,
  anthropicApiKey,
  openaiApiKey,
  geminiApiKey,
  runtimeDefaults,
  taskRuntimeDefaults,
};
