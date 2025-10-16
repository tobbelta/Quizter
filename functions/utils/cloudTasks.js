/**
 * Cloud Tasks utilities for background job processing
 */
const {CloudTasksClient} = require("@google-cloud/tasks");
const logger = require("firebase-functions/logger");
const {initializeFirebase} = require("../config/firebase");
const {REGION, PROJECT_ID} = require("../config/runtime");

const admin = initializeFirebase();
const cloudTasksClient = new CloudTasksClient();

/**
 * Ensures that the Cloud Tasks queue exists before enqueuing work.
 * Creates the queue with sensible defaults if it is missing.
 * @param {string} queueName - The short name of the queue
 *                              (without project/location).
 * @return {Promise<string>} - Fully qualified queue path.
 */
async function ensureQueue(queueName) {
  const queuePath = cloudTasksClient.queuePath(PROJECT_ID, REGION, queueName);
  try {
    await cloudTasksClient.getQueue({name: queuePath});
  } catch (error) {
    if (error.code === 5) { // NOT_FOUND
      const parent = cloudTasksClient.locationPath(PROJECT_ID, REGION);
      await cloudTasksClient.createQueue({
        parent,
        queue: {
          name: queuePath,
          rateLimits: {maxDispatchesPerSecond: 5},
          retryConfig: {
            maxRetryDuration: {seconds: 3600},
          },
        },
      });
      logger.info(`Created Cloud Tasks queue ${queueName}.`);
    } else {
      throw error;
    }
  }
  return queuePath;
}

/**
 * Enqueues a task for background processing.
 * @param {string} taskType - The type of task to enqueue
 *                            (e.g., 'generate', 'validate').
 * @param {object} payload - The data required for the task.
 * @param {string} userId - The ID of the user who initiated the task.
 * @return {Promise<string>} The ID of the created background task
 *                           document.
 */
async function enqueueTask(taskType, payload, userId) {
  const db = admin.firestore();
  const taskDocRef = db.collection("backgroundTasks").doc();
  const sanitizePayload = (data) => {
    if (Array.isArray(data)) {
      return data
          .filter((item) => item !== undefined)
          .map((item) => sanitizePayload(item));
    }

    if (data && typeof data === "object") {
      return Object.entries(data).reduce((acc, [key, value]) => {
        if (value === undefined) {
          return acc;
        }
        acc[key] = sanitizePayload(value);
        return acc;
      }, {});
    }

    return data;
  };

  const sanitizedPayload = sanitizePayload(payload);

  // Generate appropriate label and description based on taskType
  const getTaskLabels = (type, payload) => {
    switch (type) {
      case "generation":
        return {
          label: "AI-generering",
          description: `Genererar ${payload.numberOfQuestions || 0} frågor.`,
        };
      case "validation":
        return {
          label: "AI-validering",
          description: "Validerar fråga.",
        };
      case "batchvalidation":
        return {
          label: "Mass-validering",
          description: `Validerar ${payload.questionIds?.length || 0} frågor.`,
        };
      case "regenerateemoji":
        return {
          label: "Emoji-regenerering",
          description: "Genererar om emoji för fråga.",
        };
      case "batchregenerateemojis":
        return {
          label: "Mass-regenerering Emojis",
          description: `Genererar om emojis för ${
            payload.questionIds?.length || 0} frågor.`,
        };
      case "migration":
        return {
          label: "Migration",
          description: "Migrerar frågor till nytt schema.",
        };
      default:
        return {
          label: "Bakgrundsjobb",
          description: "Kör bakgrundsjobb.",
        };
    }
  };

  const {label, description} = getTaskLabels(taskType, sanitizedPayload);

  const taskInfo = {
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: "pending",
    taskType,
    label,
    description,
    userId,
    payload: sanitizedPayload,
  };
  await taskDocRef.set(taskInfo);

  const queueName = `runai${taskType}`;
  const queuePath = await ensureQueue(queueName);

  // Construct the URL to the handler function
  const url = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${queueName}`;

  const task = {
    httpRequest: {
      httpMethod: "POST",
      url,
      body: Buffer.from(JSON.stringify({
        data: {taskId: taskDocRef.id, ...sanitizedPayload},
      })).toString("base64"),
      headers: {
        "Content-Type": "application/json",
      },
      // Add OIDC token to authenticate with the private Cloud Function
      oidcToken: {
        serviceAccountEmail: `geoquest2-7e45c@appspot.gserviceaccount.com`,
      },
    },
    scheduleTime: {
      seconds: Date.now() / 1000 + 2, // Schedule to run in 2 seconds
    },
  };

  try {
    const [response] = await cloudTasksClient.createTask({
      parent: queuePath,
      task,
    });
    logger.info(`Task ${response.name} enqueued to ${queueName}.`);
    await taskDocRef.update({status: "queued", cloudTaskName: response.name});
  } catch (error) {
    logger.error("Error enqueueing task", {
      error: error.message,
      taskId: taskDocRef.id,
    });
    await taskDocRef.update({status: "failed", error: error.message});
    throw error; // Re-throw to be caught by the calling function
  }

  return taskDocRef.id;
}

module.exports = {
  cloudTasksClient,
  ensureQueue,
  enqueueTask,
};
