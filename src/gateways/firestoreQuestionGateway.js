
// Stub: Legacy Firestore gateway is now disabled. All logic moved to Cloudflare API endpoints.
export default {
  listQuestions: async () => [],
  getQuestion: async () => null,
  getQuestionsByIds: async () => [],
  subscribeToQuestions: () => () => {},
  deleteQuestion: async () => { throw new Error('Legacy gateway disabled'); },
  deleteQuestions: async () => { throw new Error('Legacy gateway disabled'); },
  updateQuestion: async () => { throw new Error('Legacy gateway disabled'); },
};
const firestoreQuestionGateway = {
  listQuestions,
  getQuestion,
  getQuestionsByIds,
  subscribeToQuestions,
  deleteQuestion,
  deleteQuestions,
  addManyQuestions,
  updateQuestion,
  updateManyQuestions,
};

export default firestoreQuestionGateway;
