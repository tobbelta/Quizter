/**
 * Service for interacting with AI-related backend functions.
 * This service handles the queuing of AI tasks.
 */
import { getAuth } from "firebase/auth";

const getFirebaseUser = () => {
  const auth = getAuth();
  return auth.currentUser;
};

const getFunctionUrl = (functionName) => {
  // This should be configured based on your environment
  const projectId = "geoquest2-7e45c";
  const region = "europe-west1";
  return `https://${region}-${projectId}.cloudfunctions.net/${functionName}`;
};

const queueTask = async (functionName, payload) => {
  const user = getFirebaseUser();
  if (!user) {
    throw new Error("User must be authenticated to queue tasks.");
  }

  const response = await fetch(getFunctionUrl(functionName), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await user.getIdToken()}`
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Failed to queue task with ${functionName}`);
  }

  return data; // Should contain { success: true, taskId: '...' }
};

export const aiService = {
  /**
   * Queues a task to generate a batch of questions.
   * @param {{ amount: number, category: string, difficulty: string, provider: string }} params
   * @returns {Promise<{success: boolean, taskId: string}>}
   */
  startAIGeneration: async ({ amount, category, ageGroup, difficulty, provider }) => {
    return await queueTask('generateAIQuestions', { amount, category, ageGroup, difficulty, provider });
  },

  /**
   * Queues a task to validate a single question.
   * @param {{ question: string, options: string[], correctOption: number, explanation: string }} params
   * @returns {Promise<{success: boolean, taskId: string}>}
   */
  startAIValidation: async ({ question, options, correctOption, explanation }) => {
    return await queueTask('validateQuestionWithAI', { question, options, correctOption, explanation });
  },

  /**
   * Queues a task to validate multiple questions in a single batch job.
   * @param {{ questions: Array<{id: string, question: string, options: string[], correctOption: number, explanation: string}> }} params
   * @returns {Promise<{success: boolean, taskId: string, questionCount: number}>}
   */
  startBatchAIValidation: async ({ questions }) => {
    return await queueTask('batchValidateQuestions', { questions });
  },

  regenerateAllIllustrations: async () => {
    return await queueTask('regenerateAllIllustrations', {});
  },

  regenerateQuestionEmoji: async ({ questionId, provider }) => {
    return await queueTask('regenerateQuestionEmoji', { questionId, provider });
  },

  startBatchEmojiRegeneration: async ({ questionIds }) => {
    return await queueTask('batchRegenerateEmojis', { questionIds });
  },
};