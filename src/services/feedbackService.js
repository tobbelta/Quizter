/**
 * Feedback Service - Hanterar feedback från användare
 */
import { getFirebaseDb } from '../firebaseClient';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const db = getFirebaseDb();

/**
 * Skicka feedback från användare
 * @param {Object} feedbackData - Feedback-data
 * @param {string} feedbackData.name - Användarens namn (valfritt)
 * @param {string} feedbackData.email - Användarens e-post (valfritt)
 * @param {string} feedbackData.message - Feedback-meddelande
 * @param {string} feedbackData.type - Typ av feedback (bug, feature, general)
 * @param {string} feedbackData.page - Nuvarande sida/route
 * @param {string} userId - Användar-ID (om inloggad)
 * @param {string} deviceId - Device-ID
 * @returns {Promise<string>} Feedback-ID
 */
export const submitFeedback = async (feedbackData, userId = null, deviceId = null) => {
  try {
    const feedback = {
      ...feedbackData,
      userId,
      deviceId,
      createdAt: serverTimestamp(),
      read: false,
      resolved: false,
      userAgent: navigator.userAgent,
      screenSize: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language
    };

    const docRef = await addDoc(collection(db, 'feedback'), feedback);
    return docRef.id;
  } catch (error) {
    console.error('Error submitting feedback:', error);
    throw error;
  }
};

export const feedbackService = {
  submitFeedback
};
