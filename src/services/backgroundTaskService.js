/**
 * Firestore helpers for background task queue monitoring.
 */
// Legacy Firestore/Firebase logic removed. Use Cloudflare API endpoint instead.
const DEFAULT_LIMIT = 100;

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

// Helper functions above the service object
// subscribeToQuery is now removed (Firestore logic gone)

  /**
   * Subscribe to all background tasks created by the specified user.
   * @param {string} userId
   * @param {(tasks: object[], error?: Error) => void} callback
   * @param {{limit?: number}} [options]
   * @returns {() => void}
   */
export const backgroundTaskService = {
  subscribeToUserTasks: function(userId, callback, options = {}) {
    if (!userId) {
      callback([]);
      return () => {};
    }
    // TODO: Replace with Cloudflare API endpoint
    // Example:
    // fetch(`/api/backgroundTasks?userId=${userId}&limit=${options.limit ?? DEFAULT_LIMIT}`)
    //   .then(res => res.json())
    //   .then(tasks => callback(tasks));
    callback([]);
    return () => {};
  },

  fetchAllTasks: async function(options = {}) {
    // TODO: Replace with Cloudflare API endpoint
    // Example:
    // const response = await fetch(`/api/backgroundTasks?limit=${options.limit ?? DEFAULT_LIMIT}`);
    // const tasks = await response.json();
    // return sortTasks(tasks);
    return [];
  },

  /**
   * Subscribe to all background tasks (superuser overview).
   * @param {(tasks: object[], error?: Error) => void} callback
   * @param {{limit?: number}} [options]
   * @returns {() => void}
   */
  subscribeToAllTasks: function(callback, options = {}) {
    // TODO: Replace with Cloudflare API endpoint
    // Example:
    // fetch(`/api/backgroundTasks?limit=${options.limit ?? DEFAULT_LIMIT}`)
    //   .then(res => res.json())
    //   .then(tasks => callback(tasks));
    callback([]);
    return () => {};
  }
};


