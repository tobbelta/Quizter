/**
 * Firestore helpers for background task queue monitoring.
 */
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseClient';

const COLLECTION = 'backgroundTasks';
const DEFAULT_LIMIT = 100;
const backgroundTasksRef = collection(db, COLLECTION);

const toDate = (value) => {
  if (!value) return null;
  if (value.toDate) {
    return value.toDate();
  }
  if (typeof value === 'number') {
    return new Date(value);
  }
  if (typeof value === 'string') {
    return new Date(value);
  }
  return null;
};

const mapTask = (doc) => {
  const data = doc.data() || {};
  return {
    id: doc.id,
    ...data,
    createdAt: toDate(data.createdAt),
    startedAt: toDate(data.startedAt),
    finishedAt: toDate(data.finishedAt),
    updatedAt: toDate(data.updatedAt),
  };
};

const subscribeToQuery = (q, callback) => onSnapshot(
  q,
  (snapshot) => {
    const tasks = snapshot.docs.map(mapTask);
    callback(tasks);
  },
  (error) => {
    console.error('[backgroundTaskService] Realtime subscription failed:', error);
    callback([], error);
  },
);

export const backgroundTaskService = {
  /**
   * Subscribe to all background tasks created by the specified user.
   * @param {string} userId
   * @param {(tasks: object[], error?: Error) => void} callback
   * @param {{limit?: number}} [options]
   * @returns {() => void}
   */
  subscribeToUserTasks(userId, callback, options = {}) {
    if (!userId) {
      callback([]);
      return () => {};
    }

    const taskLimit = options.limit ?? DEFAULT_LIMIT;
    const q = query(
      backgroundTasksRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(taskLimit),
    );

    return subscribeToQuery(q, callback);
  },

  /**
   * Subscribe to all background tasks (superuser overview).
   * @param {(tasks: object[], error?: Error) => void} callback
   * @param {{limit?: number}} [options]
   * @returns {() => void}
   */
  subscribeToAllTasks(callback, options = {}) {
    const taskLimit = options.limit ?? DEFAULT_LIMIT;
    const q = query(
      backgroundTasksRef,
      orderBy('createdAt', 'desc'),
      limit(taskLimit),
    );

    return subscribeToQuery(q, callback);
  },
};

