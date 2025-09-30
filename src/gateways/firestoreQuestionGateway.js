import { collection, getDocs, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from '../firebaseClient';

const QUESTIONS_COLLECTION = 'questions';

/**
 * Lists all questions from Firestore.
 * @returns {Promise<Array>} A promise that resolves to an array of question objects.
 */
const listQuestions = async () => {
  const db = getFirebaseDb();
  const querySnapshot = await getDocs(collection(db, QUESTIONS_COLLECTION));
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Deletes a single question from Firestore.
 * @param {string} questionId - The ID of the question to delete.
 */
const deleteQuestion = async (questionId) => {
  const db = getFirebaseDb();
  await deleteDoc(doc(db, QUESTIONS_COLLECTION, questionId));
};

/**
 * Deletes multiple questions from Firestore in a batch.
 * @param {string[]} questionIds - An array of question IDs to delete.
 */
const deleteQuestions = async (questionIds) => {
  if (!questionIds || questionIds.length === 0) {
    return;
  }
  const db = getFirebaseDb();
  const batch = writeBatch(db);

  questionIds.forEach(id => {
    const questionRef = doc(db, QUESTIONS_COLLECTION, id);
    batch.delete(questionRef);
  });

  await batch.commit();
};

/**
 * Adds multiple questions to Firestore in a batch.
 * @param {Array<Object>} questions - An array of question objects to add. Each question must have an 'id'.
 */
const addManyQuestions = async (questions) => {
  if (!questions || questions.length === 0) {
    return;
  }
  const db = getFirebaseDb();
  const batch = writeBatch(db);

  questions.forEach(question => {
    const questionRef = doc(db, QUESTIONS_COLLECTION, question.id);
    batch.set(questionRef, question, { merge: true });
  });

  await batch.commit();
};

const firestoreQuestionGateway = {
  listQuestions,
  deleteQuestion,
  deleteQuestions,
  addManyQuestions,
};

export default firestoreQuestionGateway;