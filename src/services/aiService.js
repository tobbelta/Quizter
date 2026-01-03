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
const AUTH_STORAGE_KEY = 'tipspromenad:auth';

const getStoredUserEmail = () => {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return typeof parsed?.email === 'string' ? parsed.email : '';
  } catch (error) {
    return '';
  }
};

/**
 * Queue a background task via Cloudflare API
 * @param {string} functionName - Name of the API endpoint (without /api/ prefix)
 * @param {object} payload - Task parameters
 * @returns {Promise<{taskId: string}>}
 */
const queueTask = async (functionName, payload, { userEmail } = {}) => {
  try {
    const url = `${API_BASE_URL}/api/${functionName}`;
    
    console.log(`[aiService] Queuing task: ${functionName}`, payload);

    const resolvedEmail = userEmail || getStoredUserEmail();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(resolvedEmail ? { 'x-user-email': resolvedEmail } : {})
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
  startAIGeneration: async ({ amount, category, ageGroup, difficulty, provider, userEmail }) => {
    return await queueTask(
      'generateAIQuestions',
      { amount, category, ageGroup, difficulty, provider },
      { userEmail }
    );
  },

  /**
   * Validates a single question synchronously (not as a background task).
   * @param {{ questionId: string, provider?: string }} params
   * @returns {Promise<{success: boolean, result: object}>}
   */
  startAIValidation: async ({ questionId, provider } = {}) => {
    try {
      const url = `${API_BASE_URL}/api/validateQuestionWithAI`;
      
      console.log(`[aiService] Validating question synchronously:`, { questionId, provider });
      const payload = { questionId };
      if (provider) {
        payload.provider = provider;
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI validation failed (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      
      console.log(`[aiService] Validation completed:`, result);
      
      return result;
    } catch (error) {
      console.error(`[aiService] Failed to validate question ${questionId}:`, error);
      throw error;
    }
  },

  /**
   * Queues a task to validate multiple questions in a single batch job.
   * @param {{ questions: Array<{id: string, question: string, options: string[], correctOption: number, explanation: string}> }} params
   * @returns {Promise<{success: boolean, taskId: string, questionCount: number}>}
   */
  startBatchAIValidation: async ({ questions, userEmail }) => {
    return await queueTask('batchValidateQuestions', { questions }, { userEmail });
  },

  regenerateAllIllustrations: async ({ userEmail } = {}) => {
    return await queueTask('regenerateAllIllustrations', {}, { userEmail });
  },

  /**
   * Regenerates emoji for a single question synchronously (not as a background task).
   * @param {{ questionId: string, provider?: string }} params
   * @returns {Promise<{success: boolean, emoji: string}>}
   */
  regenerateQuestionEmoji: async ({ questionId, provider = 'openai' }) => {
    try {
      const url = `${API_BASE_URL}/api/regenerateQuestionEmoji`;
      
      console.log(`[aiService] Regenerating emoji synchronously:`, { questionId, provider });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ questionId, provider })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Emoji regeneration failed (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      
      console.log(`[aiService] Emoji regenerated:`, result);
      
      return result;
    } catch (error) {
      console.error(`[aiService] Failed to regenerate emoji for question ${questionId}:`, error);
      throw error;
    }
  },

  startBatchEmojiRegeneration: async ({ questionIds, userEmail }) => {
    return await queueTask('batchRegenerateEmojis', { questionIds }, { userEmail });
  },
};
