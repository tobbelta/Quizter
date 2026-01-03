const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const apiCall = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte skicka feedback.');
  }
  return data;
};

export const submitQuestionFeedback = async (payload, userEmail = '') => {
  return apiCall('/api/question-feedback', {
    method: 'POST',
    headers: {
      ...(userEmail ? { 'x-user-email': userEmail } : {})
    },
    body: JSON.stringify(payload || {})
  });
};

export const getQuestionFeedbackSummary = async (questionId, feedbackType = 'question') => {
  const query = new URLSearchParams();
  if (questionId) query.set('questionId', questionId);
  if (feedbackType) query.set('feedbackType', feedbackType);
  const response = await fetch(`${API_BASE_URL}/api/question-feedback?${query.toString()}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte hämta feedback.');
  }
  return data.summary || null;
};
