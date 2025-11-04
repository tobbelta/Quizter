/**
 * AI SERVICE
 * 
 * SYFTE: Kommunicerar med Firebase Cloud Functions för AI-uppgifter
 * 
 * FUNKTIONALITET:
 * - Kö-hantering för AI-tasks (generering, validering, emoji-regenerering)
 * - Authentication med Firebase ID tokens
 * - Error handling och response parsing
 * 
 * TILLGÄNGLIGA TASKS:
 * - startAIGeneration(): Generera batch med frågor (OpenAI/Gemini)
 * - startAIValidation(): Validera en fråga med AI
 * - startBatchValidation(): Validera flera frågor
 * - startEmojiRegeneration(): Regenerera emoji för fråga
 * - startBatchEmojiRegeneration(): Regenerera emojis för flera frågor
 * 
 * CLOUD FUNCTIONS ENDPOINTS:
 * - generateAIQuestions
 * - validateQuestionWithAI
 * - batchValidateQuestions
 * - regenerateQuestionEmoji
 * - batchRegenerateEmojis
 * 
 * AUTHENTICATION:
 * - Kräver inloggad användare (getAuth().currentUser)
 * - Skickar Firebase ID token i Authorization header
 * 
 * ANVÄNDNING:
 * - questionService: Triggar AI-operationer
 * - AdminQuestionsPage: AI-validering och generering
 * - BackgroundTaskContext: Spårar task progress
 */
// import removed: Legacy Firebase Auth logic removed.

// Legacy Firebase Auth logic removed. Use Cloudflare API endpoint instead.

// const getFunctionUrl = (functionName) => {
//   const projectId = "geoquest2-7e45c";
//   const region = "europe-west1";
//   return `https://${region}-${projectId}.cloudfunctions.net/${functionName}`;
// };

const queueTask = async (functionName, payload) => {
  try {
    const response = await fetch(`/api/${functionName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `AI task failed: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error calling ${functionName}:`, error);
    throw error;
  }
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