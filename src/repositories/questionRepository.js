// Stub: Legacy Firestore question repository is now disabled. All logic moved to Cloudflare API endpoints.
export const questionRepository = {
  listQuestions: async () => {
    console.log('[questionRepository] Fetching questions from /api/listQuestions');
    try {
      const response = await fetch('/api/listQuestions');
      const data = await response.json();
      
      if (!data.success) {
        console.error('[questionRepository] API error:', data.error);
        return [];
      }
      
      console.log(`[questionRepository] Loaded ${data.count} questions from API`);
      return data.questions || [];
    } catch (error) {
      console.error('[questionRepository] Failed to fetch questions:', error);
      return [];
    }
  },
  deleteQuestion: async () => { throw new Error('Legacy questionRepository disabled'); },
  deleteQuestions: async () => { throw new Error('Legacy questionRepository disabled'); },
  addManyQuestions: async () => { throw new Error('Legacy questionRepository disabled'); },
  updateQuestion: async () => { throw new Error('Legacy questionRepository disabled'); },
  updateManyQuestions: async () => { throw new Error('Legacy questionRepository disabled'); },
};
