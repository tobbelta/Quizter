/**
 * Firestore helpers for background task queue monitoring.
 */
import {
  collection,
  getDocs,
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

const sortTasks = (tasks) => {
  return [...tasks].sort((a, b) => {
    const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
    const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
    if (aTime !== bTime) {
      return bTime - aTime;
    }
    return a.id.localeCompare(b.id);
  });
};

const FINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const subscribeToQuery = (q, callback) => {
  const progressCache = new Map();

  return onSnapshot(
    q,
    (snapshot) => {
      const tasks = sortTasks(snapshot.docs.map((doc) => {
        const task = mapTask(doc);
        const { progress, status, id } = task;

        if (!progress || typeof progress.completed !== 'number') {
          if (FINAL_STATUSES.has(status)) {
            progressCache.delete(id);
          }
          return task;
        }

        const cached = progressCache.get(id);
        const currentCompleted = Number(progress.completed) || 0;
        const currentTotal = Number(progress.total) || 0;
        const shouldResetCache = status === 'queued' || status === 'pending';

        if (shouldResetCache || !cached) {
          progressCache.set(id, { completed: currentCompleted, total: currentTotal });
          if (FINAL_STATUSES.has(status)) {
            progressCache.delete(id);
          }
          return task;
        }

        let nextCompleted = currentCompleted;
        let nextTotal = currentTotal;

        if (status === 'processing' && currentCompleted < cached.completed) {
          nextCompleted = cached.completed;
          nextTotal = Math.max(cached.total ?? 0, currentTotal);
        }

        progressCache.set(id, { completed: nextCompleted, total: Math.max(nextTotal, cached.total ?? 0) });

        if (FINAL_STATUSES.has(status)) {
          progressCache.delete(id);
        }

        if (nextCompleted === currentCompleted && nextTotal === currentTotal) {
          return task;
        }

        return {
          ...task,
          progress: {
            ...progress,
            completed: nextCompleted,
            total: nextTotal,
          },
        };
      }));

      callback(tasks);
    },
    (error) => {
      console.error('[backgroundTaskService] Realtime subscription failed:', error);
      callback([], error);
    },
  );
};

export const backgroundTaskService = {
  async fetchUserTasks(userId, options = {}) {
    if (!userId) {
      return [];
    }
    const taskLimit = options.limit ?? DEFAULT_LIMIT;
    const q = query(
      backgroundTasksRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(taskLimit),
    );
    const snapshot = await getDocs(q);
    return sortTasks(snapshot.docs.map(mapTask));
  },

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

  async fetchAllTasks(options = {}) {
    const taskLimit = options.limit ?? DEFAULT_LIMIT;
    const q = query(
      backgroundTasksRef,
      orderBy('createdAt', 'desc'),
      limit(taskLimit),
    );
    const snapshot = await getDocs(q);
    return sortTasks(snapshot.docs.map(mapTask));
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

