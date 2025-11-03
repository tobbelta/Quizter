/**
 * Feedback Service - Hanterar feedback från användare
 */
// Legacy Firebase/Firestore feedback logic removed. Use Cloudflare API endpoint instead.

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
      createdAt: Date.now(),
      read: false,
      resolved: false,
      userAgent: navigator.userAgent,
      screenSize: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language
    };

    // TODO: Replace with Cloudflare API endpoint
    // const response = await fetch('/api/feedback', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(feedback)
    // });
    // return (await response.json()).id;
    return null;
  } catch (error) {
    console.error('Error submitting feedback:', error);
    throw error;
  }
};

export const feedbackService = {
  submitFeedback
};
