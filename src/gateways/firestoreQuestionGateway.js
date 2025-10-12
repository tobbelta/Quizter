import { collection, getDocs, getDoc, doc, deleteDoc, writeBatch, serverTimestamp, updateDoc, onSnapshot } from 'firebase/firestore';
import { getFirebaseDb } from '../firebaseClient';

const QUESTIONS_COLLECTION = 'questions';

/**
 * Lists all questions from Firestore (one-time fetch).
 * @returns {Promise<Array>} A promise that resolves to an array of question objects.
 */
const listQuestions = async () => {
  const db = getFirebaseDb();
  const querySnapshot = await getDocs(collection(db, QUESTIONS_COLLECTION));
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const getQuestion = async (questionId) => {
  if (!questionId) return null;
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, QUESTIONS_COLLECTION, questionId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

const getQuestionsByIds = async (questionIds = []) => {
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return [];
  }

  const db = getFirebaseDb();
  const reads = questionIds.map((id) => getDoc(doc(db, QUESTIONS_COLLECTION, id)));
  const snapshots = await Promise.all(reads);
  return snapshots
    .filter((snap) => snap.exists())
    .map((snap) => ({ id: snap.id, ...snap.data() }));
};

/**
 * Subscribes to real-time updates for all questions.
 * @param {Function} callback - Function to call when questions change.
 * @returns {Function} Unsubscribe function to stop listening.
 */
const subscribeToQuestions = (callback) => {
  const db = getFirebaseDb();
  const questionsRef = collection(db, QUESTIONS_COLLECTION);

  // onSnapshot returnerar en unsubscribe-funktion
  const unsubscribe = onSnapshot(
    questionsRef,
    (querySnapshot) => {
      const questions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(questions);
    },
    (error) => {
      console.error('[Firestore] Error in questions subscription:', error);
      callback([]); // Returnera tom array vid fel
    }
  );

  return unsubscribe;
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
    // Lägg till createdAt om det inte finns
    const questionData = {
      ...question,
      createdAt: question.createdAt || serverTimestamp()
    };
    batch.set(questionRef, questionData, { merge: true });
  });

  await batch.commit();
};

/**
 * Updates a question in Firestore.
 * @param {string} questionId - The ID of the question to update.
 * @param {Object} updateData - The data to update.
 */
const updateQuestion = async (questionId, updateData) => {
  const db = getFirebaseDb();
  const questionRef = doc(db, QUESTIONS_COLLECTION, questionId);
  await updateDoc(questionRef, updateData);
};

/**
 * Updates multiple questions in Firestore using a batch write.
 * @param {Array<{questionId: string, updateData: Object}>} updates - Array of question updates.
 */
const updateManyQuestions = async (updates) => {
  if (!updates || updates.length === 0) {
    return;
  }
  const db = getFirebaseDb();

  // Firestore batch writes are limited to 500 operations
  // Split into chunks of 500 if needed
  const BATCH_SIZE = 500;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = updates.slice(i, i + BATCH_SIZE);

    chunk.forEach(({ questionId, updateData }) => {
      const questionRef = doc(db, QUESTIONS_COLLECTION, questionId);
      batch.update(questionRef, updateData);
    });

    await batch.commit();
  }
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
