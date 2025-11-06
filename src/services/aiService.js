/**
 * AI SERVICE
 * 
 * SYFTE: Kommunicerar med Cloudflare API för AI-uppgifter
 * 
 * FUNKTIONALITET:
 * - Kö-hantering för AI-tasks (generering, validering, emoji-regenerering)
 * - Error handling och response parsing
 * 
 * TILLGÄNGLIGA TASKS:
 * - startAIGeneration(): Generera batch med frågor (OpenAI/Gemini/Anthropic/Mistral)
 * - startAIValidation(): Validera en fråga med AI
 * - startBatchValidation(): Validera flera frågor
 * - startEmojiRegeneration(): Regenerera emoji för fråga
 * - startBatchEmojiRegeneration(): Regenerera emojis för flera frågor
 * 
 * CLOUDFLARE API ENDPOINTS:
 * - /api/generateAIQuestions
 * - /api/validateQuestionWithAI
 * - /api/batchValidateQuestions
 * - /api/regenerateQuestionEmoji
 * - /api/batchRegenerateEmojis
 * 
 * ANVÄNDNING:
 * - questionService: Triggar AI-operationer
 * - AdminQuestionsPage: AI-validering och generering
 * - BackgroundTaskContext: Spårar task progress
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

/**
 * Queue a background task via Cloudflare API
 * @param {string} functionName - Name of the API endpoint (without /api/ prefix)
 * @param {object} payload - Task parameters
 * @returns {Promise<{taskId: string}>}
 */
const queueTask = async (functionName, payload) => {
  try {
    const url = `${API_BASE_URL}/api/${functionName}`;
    
    console.log(`[aiService] Queuing task: ${functionName}`, payload);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        // TODO: Add user email header when authentication is implemented
        // 'x-user-email': userEmail
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI task failed (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    
    console.log(`[aiService] Task queued successfully:`, result);
    
    return result;
  } catch (error) {
    console.error(`[aiService] Failed to queue task ${functionName}:`, error);
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
   * @param {{ questionId: string, provider?: string }} params
   * @returns {Promise<{success: boolean, taskId: string}>}
   */
  startAIValidation: async ({ questionId, provider }) => {
    return await queueTask('validateQuestionWithAI', { questionId, provider });
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