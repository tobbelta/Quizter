/**
 * Task Service
 * 
 * Provides utilities for working with background tasks.
 * Uses polling to monitor task completion since Cloudflare doesn't support real-time subscriptions.
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

/**
 * Subscribe to a specific task's status updates via polling
 * @param {string} taskId - The task ID to monitor
 * @param {function} onUpdate - Callback called with task updates
 * @returns {function} Unsubscribe function
 */
const subscribeToTask = (taskId, onUpdate) => {
  if (!taskId) {
    return () => {};
  }

  const pollInterval = 1000; // Poll every 1 second
  let isActive = true;
  
  const poll = async () => {
    if (!isActive) return;
    
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/getBackgroundTasks?taskId=${encodeURIComponent(taskId)}`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch task: ${response.statusText}`);
      }
      
      const data = await response.json();
      const task = data.tasks?.[0];
      
      if (!task) {
        onUpdate({ status: 'failed', error: 'Task not found' });
        isActive = false;
        return;
      }

      onUpdate(task);

      // Stop polling if task is complete
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        isActive = false;
        return;
      }
    } catch (error) {
      console.error('[taskService] Error polling task:', error);
      onUpdate({ status: 'failed', error: error.message });
      isActive = false;
      return;
    }
    
    if (isActive) {
      setTimeout(poll, pollInterval);
    }
  };
  
  // Start polling
  poll();
  
  // Return unsubscribe function
  return () => {
    isActive = false;
  };
};

/**
 * Wait for a task to complete
 * @param {string} taskId - The task ID to wait for
 * @param {object} options - Options { timeout }
 * @returns {Promise<object>} The completed task
 */
const waitForCompletion = async (taskId, options = {}) => {
  const timeout = options.timeout || 300000; // 5 minutes default
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const unsubscribe = subscribeToTask(taskId, (task) => {
      if (task.status === 'completed') {
        unsubscribe();
        resolve(task);
      } else if (task.status === 'failed') {
        unsubscribe();
        reject(new Error(task.error || 'Task failed'));
      } else if (task.status === 'cancelled') {
        unsubscribe();
        reject(new Error('Task was cancelled'));
      }
      
      // Check timeout
      if (Date.now() - startTime > timeout) {
        unsubscribe();
        reject(new Error('Task timeout'));
      }
    });
  });
};

export const taskService = {
  subscribeToTask,
  waitForCompletion,
};
