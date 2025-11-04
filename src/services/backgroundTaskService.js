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

  /**
   * Subscribe to a single task using Server-Sent Events (SSE)
   * @param {string} taskId - The task ID to subscribe to
   * @param {(task: object) => void} onUpdate - Callback for task updates
   * @param {(task: object) => void} onComplete - Callback when task completes
   * @param {(error: string) => void} onError - Callback for errors
   * @returns {() => void} Cleanup function
   */
  subscribeToTask: function(taskId, onUpdate, onComplete, onError) {
    let eventSource;
    
    try {
      // Create EventSource for SSE
      eventSource = new EventSource(`/api/subscribeToTask?taskId=${encodeURIComponent(taskId)}`);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'update':
              onUpdate && onUpdate(data.task);
              break;
            
            case 'complete':
              onComplete && onComplete(data.task);
              eventSource.close();
              break;
            
            case 'error':
            case 'timeout':
              onError && onError(data.error || 'Unknown error');
              eventSource.close();
              break;
          }
        } catch (error) {
          console.error('[subscribeToTask] Error parsing event:', error);
          onError && onError('Failed to parse server event');
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('[subscribeToTask] EventSource error:', error);
        onError && onError('Connection to task server failed');
        eventSource.close();
      };
      
    } catch (error) {
      console.error('[subscribeToTask] Failed to create EventSource:', error);
      onError && onError('Failed to subscribe to task');
    }
    
    // Return cleanup function
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  },

  subscribeToUserTasks: function(userId, callback, options = {}) {
    if (!userId) {
      callback([]);
      return () => {};
    }
    
    // Initial fetch
    this.fetchUserTasks(userId).then(callback).catch(error => {
      console.error('[backgroundTaskService] Initial fetch error:', error);
      callback([], error);
    });
    
    // For multiple tasks, we still need to poll or use WebSockets
    // For now, keep polling for the overview but individual tasks use SSE
    const intervalId = setInterval(async () => {
      try {
        const tasks = await this.fetchUserTasks(userId);
        callback(tasks);
      } catch (error) {
        console.error('[backgroundTaskService] Poll error:', error);
        callback([], error);
      }
    }, 5000); // Poll every 5 seconds for the list
    
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


