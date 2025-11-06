// Stub: Replace with API-based subscription if needed
export const subscribeToMessages = (userId = null, deviceId = null, callback) => {
  return () => {};
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
export const sendMessage = async (messageData) => {
  // Stub: Replace with API call to send message
  return { success: false, error: 'MessageService disabled - use API endpoint' };
};

/**
 * Hämta meddelanden för en användare eller enhet
 * @param {string} userId - Användar-ID (optional)
 * @param {string} deviceId - Device-ID (optional)
 * @returns {Promise<Array>} Array med meddelanden
 */
export const getMessages = async (userId = null, deviceId = null) => {
  // Stub: Replace with API call to fetch messages
  return [];
};

/**
 * Markera meddelande som läst
 * @param {string} messageId - Meddelande-ID
 */
export const markAsRead = async (messageId) => {
  // Stub: Replace with API call to mark message as read
  return { success: false, error: 'MessageService disabled - use API endpoint' };
};

/**
 * Radera meddelande (soft delete)
 * @param {string} messageId - Meddelande-ID
 */
export const deleteMessage = async (messageId) => {
  // Stub: Replace with API call to delete message
  return { success: false, error: 'MessageService disabled - use API endpoint' };
};

/**
 * Radera meddelande permanent (hard delete)
 * @param {string} messageId - Meddelande-ID
 */
export const permanentDeleteMessage = async (messageId) => {
  // Stub: Replace with API call to permanently delete message
  return { success: false, error: 'MessageService disabled - use API endpoint' };
};

/**
 * Hämta alla meddelanden (för admin)
 * @returns {Promise<Array>} Array med alla meddelanden
 */
export const getAllMessages = async () => {
  // Stub: Replace with API call to fetch all messages
  return [];
};

/**
 * Räkna olästa meddelanden för användare/enhet
 * @param {string} userId - Användar-ID (optional)
 * @param {string} deviceId - Device-ID (optional)
 * @returns {Promise<number>} Antal olästa meddelanden
 */
export const getUnreadCount = async (userId = null, deviceId = null) => {
  // Stub: Replace with API call to get unread count
  return 0;
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
