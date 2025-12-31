const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const buildQuery = (params) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const subscribeToMessages = (userId = null, deviceId = null, callback, options = {}) => {
  const intervalMs = Number(options.intervalMs) || 15000;
  let isActive = true;
  let intervalId = null;

  const fetchMessages = async () => {
    if (!isActive) return;
    try {
      const messages = await getMessages(userId, deviceId);
      if (!isActive) return;
      callback(messages);
    } catch (error) {
      console.warn('[messageService] Kunde inte hämta meddelanden:', error);
    }
  };

  fetchMessages();
  intervalId = setInterval(fetchMessages, intervalMs);

  return () => {
    isActive = false;
    if (intervalId) {
      clearInterval(intervalId);
    }
  };
};

/**
 * Message Service - Hanterar meddelanden från admin till användare
 * All operations use Cloudflare API endpoints
 */

/**
 * Skicka meddelande från admin
 * @param {Object} messageData - Meddelandedata
 * @param {string} messageData.title - Rubrik
 * @param {string} messageData.message - Meddelandetext
 * @param {string} messageData.type - info, warning, success, error, system
 * @param {string} messageData.userId - Användar-ID (optional)
 * @param {string} messageData.deviceId - Device-ID (optional)
 * @param {string} messageData.adminId - ID på admin som skickar
 * @param {Object} messageData.metadata - Extra metadata (optional)
 * @returns {Promise<string>} Meddelande-ID
 */
export const sendMessage = async (messageData, userEmail = '') => {
  const response = await fetch(`${API_BASE_URL}/api/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': userEmail || ''
    },
    body: JSON.stringify(messageData || {})
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte skicka meddelande.');
  }
  return data;
};

/**
 * Hämta meddelanden för en användare eller enhet
 * @param {string} userId - Användar-ID (optional)
 * @param {string} deviceId - Device-ID (optional)
 * @returns {Promise<Array>} Array med meddelanden
 */
export const getMessages = async (userId = null, deviceId = null) => {
  const query = buildQuery({ userId, deviceId });
  const response = await fetch(`${API_BASE_URL}/api/messages${query}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte hämta meddelanden.');
  }
  return data.messages || [];
};

/**
 * Markera meddelande som läst
 * @param {string} messageId - Meddelande-ID
 */
export const markAsRead = async (messageId, userId = null, deviceId = null) => {
  const response = await fetch(`${API_BASE_URL}/api/messages/${messageId}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, deviceId })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte markera meddelande som läst.');
  }
  return data;
};

/**
 * Radera meddelande (soft delete)
 * @param {string} messageId - Meddelande-ID
 */
export const deleteMessage = async (messageId, userId = null, deviceId = null) => {
  const response = await fetch(`${API_BASE_URL}/api/messages/${messageId}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, deviceId })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte radera meddelande.');
  }
  return data;
};

/**
 * Radera meddelande permanent (hard delete)
 * @param {string} messageId - Meddelande-ID
 */
export const permanentDeleteMessage = async (messageId, userEmail = '') => {
  const response = await fetch(`${API_BASE_URL}/api/messages/${messageId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': userEmail || ''
    }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte radera meddelande.');
  }
  return data;
};

/**
 * Hämta alla meddelanden (för admin)
 * @returns {Promise<Array>} Array med alla meddelanden
 */
export const getAllMessages = async (userEmail = '') => {
  const response = await fetch(`${API_BASE_URL}/api/messages/all`, {
    headers: {
      'x-user-email': userEmail || ''
    }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte hämta meddelanden.');
  }
  return data.messages || [];
};

/**
 * Räkna olästa meddelanden för användare/enhet
 * @param {string} userId - Användar-ID (optional)
 * @param {string} deviceId - Device-ID (optional)
 * @returns {Promise<number>} Antal olästa meddelanden
 */
export const getUnreadCount = async (userId = null, deviceId = null) => {
  const query = buildQuery({ userId, deviceId });
  const response = await fetch(`${API_BASE_URL}/api/messages/unread${query}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte hämta olästa meddelanden.');
  }
  return data.count || 0;
};

export const messageService = {
  sendMessage,
  getMessages,
  subscribeToMessages,
  markAsRead,
  deleteMessage,
  permanentDeleteMessage,
  getAllMessages,
  getUnreadCount
};
