/**
 * Repository for question-related Firestore operations.
 */
import firestoreQuestionGateway from '../gateways/firestoreQuestionGateway';

/**
 * Deletes a question document from Firestore.
 * @param {string} questionId - The ID of the question to delete.
 */
const deleteQuestion = async (questionId) => {
  await firestoreQuestionGateway.deleteQuestion(questionId);
};

/**
 * Deletes multiple question documents from Firestore in a batch.
 * @param {string[]} questionIds - An array of question IDs to delete.
 */
const deleteQuestions = async (questionIds) => { // This function is already implemented in the context
  await firestoreQuestionGateway.deleteQuestions(questionIds);
};

const listQuestions = async () => {
  return firestoreQuestionGateway.listQuestions();
};

const subscribeToQuestions = (callback) => {
  return firestoreQuestionGateway.subscribeToQuestions(callback);
};

const addManyQuestions = async (questions) => {
  await firestoreQuestionGateway.addManyQuestions(questions);
};

const updateQuestion = async (questionId, updateData) => {
  await firestoreQuestionGateway.updateQuestion(questionId, updateData);
};

const updateManyQuestions = async (updates) => {
  await firestoreQuestionGateway.updateManyQuestions(updates);
};

export const questionRepository = {
  deleteQuestion,
  deleteQuestions,
  listQuestions,
  subscribeToQuestions,
  addManyQuestions,
  updateQuestion,
  updateManyQuestions,
};