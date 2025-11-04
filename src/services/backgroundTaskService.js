/**
 * Firestore helpers for background task queue monitoring.
 */
// Legacy Firestore/Firebase logic removed. Use Cloudflare API endpoint instead.

// Helper functions removed (no longer needed without Firestore)
// const DEFAULT_LIMIT = 100;
// const toDate = (value) => { ... }
// const mapTask = (doc) => { ... }
// const sortTasks = (tasks) => { ... }
// const FINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

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
  fetchUserTasks: async function(userId) {
    if (!userId) return [];
    
    try {
      const response = await fetch(`/api/getBackgroundTasks?userId=${encodeURIComponent(userId)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      return data.tasks || [];
    } catch (error) {
      console.error('[backgroundTaskService] fetchUserTasks error:', error);
      return [];
    }
  },

  subscribeToUserTasks: function(userId, callback, options = {}) {
    if (!userId) {
      callback([]);
      return () => {};
    }
    
    // Poll every 2 seconds for task updates
    const poll = async () => {
      try {
        const tasks = await this.fetchUserTasks(userId);
        callback(tasks);
      } catch (error) {
        console.error('[backgroundTaskService] Poll error:', error);
        callback([], error);
      }
    };
    
    // Initial fetch
    poll();
    
    // Set up polling interval
    const intervalId = setInterval(poll, 2000);
    
    // Return cleanup function
    return () => clearInterval(intervalId);
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


