/**
 * QUESTION REPOSITORY
 * 
 * Hanterar all kommunikation med Cloudflare backend API för frågor.
 * Migrerad från Firestore till Cloudflare D1 database via API endpoints.
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

// Helper för API-anrop
const apiCall = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.json();
};

export const questionRepository = {
  /**
   * Hämta alla frågor från databasen
   */
  listQuestions: async () => {
    try {
      const data = await apiCall('/api/listQuestions');
      return data.questions || [];
    } catch (error) {
      console.error('[questionRepository] Failed to list questions:', error);
      throw error;
    }
  },

  /**
   * Hämta frågor baserat på IDs
   */
  getQuestionsByIds: async (ids) => {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        return [];
      }
      const data = await apiCall('/api/questions', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      return data.questions || [];
    } catch (error) {
      console.error('[questionRepository] Failed to get questions by IDs:', error);
      throw error;
    }
  },

  /**
   * Lägg till flera frågor samtidigt
   */
  addManyQuestions: async (questions) => {
    try {
      if (!Array.isArray(questions) || questions.length === 0) {
        return { success: true, count: 0 };
      }
      const data = await apiCall('/api/questions/batch', {
        method: 'POST',
        body: JSON.stringify({ questions }),
      });
      return data;
    } catch (error) {
      console.error('[questionRepository] Failed to add questions:', error);
      throw error;
    }
  },

  /**
   * Uppdatera en fråga
   */
  updateQuestion: async (questionId, updates) => {
    try {
      const data = await apiCall(`/api/questions/${questionId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      return data;
    } catch (error) {
      console.error('[questionRepository] Failed to update question:', error);
      throw error;
    }
  },

  /**
   * Uppdatera flera frågor samtidigt
   */
  updateManyQuestions: async (updates) => {
    try {
      if (!Array.isArray(updates) || updates.length === 0) {
        return { success: true, count: 0 };
      }
      const data = await apiCall('/api/questions/batch-update', {
        method: 'PUT',
        body: JSON.stringify({ updates }),
      });
      return data;
    } catch (error) {
      console.error('[questionRepository] Failed to batch update questions:', error);
      throw error;
    }
  },

  /**
   * Ta bort en fråga
   */
  deleteQuestion: async (questionId) => {
    try {
      const data = await apiCall(`/api/questions/${questionId}`, {
        method: 'DELETE',
      });
      return data;
    } catch (error) {
      console.error('[questionRepository] Failed to delete question:', error);
      throw error;
    }
  },

  /**
   * Ta bort flera frågor samtidigt
   */
  deleteQuestions: async (questionIds) => {
    try {
      if (!Array.isArray(questionIds) || questionIds.length === 0) {
        return { success: true, count: 0 };
      }
      const data = await apiCall('/api/questions/batch-delete', {
        method: 'DELETE',
        body: JSON.stringify({ ids: questionIds }),
      });
      return data;
    } catch (error) {
      console.error('[questionRepository] Failed to delete questions:', error);
      throw error;
    }
  },
};
