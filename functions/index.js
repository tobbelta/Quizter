/**
 * Cloud Functions-skelett för tipspromenadens backend-endpoints.
 */
const functions = require("firebase-functions");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const REGION = "europe-west1";
const runtimeDefaults = { memory: "512MB", timeoutSeconds: 60 };

const createHttpsHandler = (handler) =>
  functions.region(REGION).runWith(runtimeDefaults).https.onRequest(handler);

const ensurePost = (req, res) => {
  if (req.method !== "POST") {
    res.set("Allow", "POST");
    res.status(405).json({ error: "Method Not Allowed" });
    return false;
  }
  return true;
};

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
  // TODO: Uppdatera deltagarens svar och poäng.
  if (!ensurePost(req, res)) {
    return;
  }

  logger.info("submitAnswer called", { participantId: req.body?.participantId });
  res.status(501).json({ error: "Not implemented" });
});

exports.closeRun = createHttpsHandler(async (req, res) => {
  // TODO: Stäng rundan och skriv closedAt i Firestore.
  if (!ensurePost(req, res)) {
    return;
  }

  logger.info("closeRun called", { runId: req.body?.runId });
  res.status(501).json({ error: "Not implemented" });
});

// Schemalagd funktion som ska hämta fler frågor löpande.
exports.questionImport = functions
  .region(REGION)
  .pubsub.schedule("every 6 hours")
  .onRun(async (context) => {
    logger.info("questionImport trigger executed", { timestamp: context.timestamp });
    logger.warn("TODO: implement automatic question import");
  });
