/**
 * Message Service - Hanterar meddelanden från admin till användare
 */
import { getFirebaseDb } from '../firebaseClient';
import { collection, addDoc, getDocs, query, where, orderBy, updateDoc, doc, serverTimestamp, deleteDoc, onSnapshot } from 'firebase/firestore';

const db = getFirebaseDb();

/**
 * Skicka meddelande från admin
 * @param {Object} messageData - Meddelandedata
 * @param {string} messageData.title - Rubrik
 * @param {string} messageData.body - Meddelandetext
 * @param {string} messageData.type - info, warning, success, error
 * @param {string} messageData.targetType - all, user, device
 * @param {string} messageData.targetId - användar-ID eller device-ID (om targetType inte är all)
 * @param {string} adminId - ID på admin som skickar
 * @returns {Promise<string>} Meddelande-ID
 */
export const sendMessage = async (messageData, adminId) => {
  try {
    const message = {
      ...messageData,
      adminId,
      createdAt: serverTimestamp(),
      read: false,
      deleted: false
    };

    const docRef = await addDoc(collection(db, 'messages'), message);
    return docRef.id;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

/**
 * Hämta meddelanden för en användare eller enhet
 * @param {string} userId - Användar-ID (optional)
 * @param {string} deviceId - Device-ID (optional)
 * @returns {Promise<Array>} Array med meddelanden
 */
export const getMessages = async (userId = null, deviceId = null) => {
  try {
    const messagesRef = collection(db, 'messages');
    let queries = [];

    // Hämta meddelanden till alla
    queries.push(
      getDocs(query(
        messagesRef,
        where('targetType', '==', 'all'),
        where('deleted', '==', false),
        orderBy('createdAt', 'desc')
      ))
    );

    // Hämta användarspecifika meddelanden
    if (userId) {
      queries.push(
        getDocs(query(
          messagesRef,
          where('targetType', '==', 'user'),
          where('targetId', '==', userId),
          where('deleted', '==', false),
          orderBy('createdAt', 'desc')
        ))
      );
    }

    // Hämta enhetsspecifika meddelanden
    if (deviceId) {
      queries.push(
        getDocs(query(
          messagesRef,
          where('targetType', '==', 'device'),
          where('targetId', '==', deviceId),
          where('deleted', '==', false),
          orderBy('createdAt', 'desc')
        ))
      );
    }

    const snapshots = await Promise.all(queries);
    const messages = [];

    snapshots.forEach(snapshot => {
      snapshot.docs.forEach(doc => {
        messages.push({
          id: doc.id,
          ...doc.data()
        });
      });
    });

    // Sortera efter skapad-datum, nyaste först
    messages.sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return b.createdAt.toDate() - a.createdAt.toDate();
    });

    // Ta bort duplicates (om samma meddelande matchar flera queries)
    const uniqueMessages = Array.from(
      new Map(messages.map(m => [m.id, m])).values()
    );

    return uniqueMessages;
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
};

/**
 * Lyssna på meddelanden i realtid för en användare eller enhet
 * @param {string} userId - Användar-ID (optional)
 * @param {string} deviceId - Device-ID (optional)
 * @param {Function} callback - Callback-funktion som anropas med meddelanden
 * @returns {Function} Unsubscribe-funktion
 */
export const subscribeToMessages = (userId = null, deviceId = null, callback) => {
  const messagesRef = collection(db, 'messages');
  const unsubscribers = [];
  const messagesMap = new Map();

  const updateMessages = () => {
    const messages = Array.from(messagesMap.values());
    messages.sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return b.createdAt.toDate() - a.createdAt.toDate();
    });
    callback(messages);
  };

  // Lyssna på meddelanden till alla
  const unsubAll = onSnapshot(
    query(
      messagesRef,
      where('targetType', '==', 'all'),
      where('deleted', '==', false),
      orderBy('createdAt', 'desc')
    ),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const message = { id: change.doc.id, ...change.doc.data() };
        if (change.type === 'removed' || message.deleted) {
          messagesMap.delete(change.doc.id);
        } else {
          messagesMap.set(change.doc.id, message);
        }
      });
      updateMessages();
    },
    (error) => {
      console.error('Error in messages subscription:', error);
    }
  );
  unsubscribers.push(unsubAll);

  // Lyssna på användarspecifika meddelanden
  if (userId) {
    const unsubUser = onSnapshot(
      query(
        messagesRef,
        where('targetType', '==', 'user'),
        where('targetId', '==', userId),
        where('deleted', '==', false),
        orderBy('createdAt', 'desc')
      ),
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const message = { id: change.doc.id, ...change.doc.data() };
          if (change.type === 'removed' || message.deleted) {
            messagesMap.delete(change.doc.id);
          } else {
            messagesMap.set(change.doc.id, message);
          }
        });
        updateMessages();
      },
      (error) => {
        console.error('Error in user messages subscription:', error);
      }
    );
    unsubscribers.push(unsubUser);
  }

  // Lyssna på enhetsspecifika meddelanden
  if (deviceId) {
    const unsubDevice = onSnapshot(
      query(
        messagesRef,
        where('targetType', '==', 'device'),
        where('targetId', '==', deviceId),
        where('deleted', '==', false),
        orderBy('createdAt', 'desc')
      ),
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const message = { id: change.doc.id, ...change.doc.data() };
          if (change.type === 'removed' || message.deleted) {
            messagesMap.delete(change.doc.id);
          } else {
            messagesMap.set(change.doc.id, message);
          }
        });
        updateMessages();
      },
      (error) => {
        console.error('Error in device messages subscription:', error);
      }
    );
    unsubscribers.push(unsubDevice);
  }

  // Returnera en funktion som avbryter alla subscriptions
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
};

/**
 * Markera meddelande som läst
 * @param {string} messageId - Meddelande-ID
 */
export const markAsRead = async (messageId) => {
  try {
    const messageRef = doc(db, 'messages', messageId);
    await updateDoc(messageRef, {
      read: true,
      readAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
  }
};

/**
 * Radera meddelande (soft delete)
 * @param {string} messageId - Meddelande-ID
 */
export const deleteMessage = async (messageId) => {
  try {
    const messageRef = doc(db, 'messages', messageId);
    await updateDoc(messageRef, {
      deleted: true,
      deletedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error deleting message:', error);
  }
};

/**
 * Radera meddelande permanent (hard delete)
 * @param {string} messageId - Meddelande-ID
 */
export const permanentDeleteMessage = async (messageId) => {
  try {
    await deleteDoc(doc(db, 'messages', messageId));
  } catch (error) {
    console.error('Error permanently deleting message:', error);
  }
};

/**
 * Hämta alla meddelanden (för admin)
 * @returns {Promise<Array>} Array med alla meddelanden
 */
export const getAllMessages = async () => {
  try {
    const snapshot = await getDocs(
      query(collection(db, 'messages'), orderBy('createdAt', 'desc'))
    );

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching all messages:', error);
    return [];
  }
};

/**
 * Räkna olästa meddelanden för användare/enhet
 * @param {string} userId - Användar-ID (optional)
 * @param {string} deviceId - Device-ID (optional)
 * @returns {Promise<number>} Antal olästa meddelanden
 */
export const getUnreadCount = async (userId = null, deviceId = null) => {
  try {
    const messages = await getMessages(userId, deviceId);
    return messages.filter(m => !m.read).length;
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
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
