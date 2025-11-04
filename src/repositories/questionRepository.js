// Stub: Legacy Firestore question repository is now disabled. All logic moved to Cloudflare API endpoints.
export const questionRepository = {
  listQuestions: async () => {
    // TODO: Implement /api/listQuestions endpoint in Cloudflare Functions
    // For now, return empty array to prevent errors
    console.log('[questionRepository] listQuestions called - returning empty array (TODO: implement API endpoint)');
    return [];
  },
  deleteQuestion: async () => { throw new Error('Legacy questionRepository disabled'); },
  deleteQuestions: async () => { throw new Error('Legacy questionRepository disabled'); },
  addManyQuestions: async () => { throw new Error('Legacy questionRepository disabled'); },
  updateQuestion: async () => { throw new Error('Legacy questionRepository disabled'); },
  updateManyQuestions: async () => { throw new Error('Legacy questionRepository disabled'); },
};
