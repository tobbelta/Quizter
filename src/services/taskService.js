/**
 * Task Service
 * 
 * Provides utilities for working with background tasks.
 * Uses SSE when available, with polling fallback.
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

/**
 * Subscribe to a specific task's status updates via SSE (fallback to polling)
 * @param {string} taskId - The task ID to monitor
 * @param {function} onUpdate - Callback called with task updates
 * @returns {function} Unsubscribe function
 */
const subscribeToTask = (taskId, onUpdate) => {
  if (!taskId) {
    return () => {};
  }

  let pollUnsubscribe = null;
  const sseUnsubscribe = subscribeToTaskViaSSE(taskId, onUpdate, () => {
    if (pollUnsubscribe) return;
    pollUnsubscribe = subscribeToTaskPolling(taskId, onUpdate);
  });

  if (!sseUnsubscribe) {
    pollUnsubscribe = subscribeToTaskPolling(taskId, onUpdate);
  }

  return () => {
    if (sseUnsubscribe) sseUnsubscribe();
    if (pollUnsubscribe) pollUnsubscribe();
  };
};

const subscribeToTaskViaSSE = (taskId, onUpdate, onError) => {
  if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
    return null;
  }

  const url = `${API_BASE_URL}/api/subscribeToTask?taskId=${encodeURIComponent(taskId)}`;
  const source = new EventSource(url);
  let isClosed = false;

  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data || '{}');
      if (payload.task) {
        let progress = payload.task.progress;
        if (typeof progress === 'string') {
          try {
            progress = JSON.parse(progress);
          } catch (error) {
            progress = payload.task.progress;
          }
        }
        const task = {
          ...payload.task,
          progress,
        };
        onUpdate(task);
        if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
          source.close();
          isClosed = true;
        }
        return;
      }

      if (payload.type === 'error' || payload.type === 'timeout') {
        onUpdate({ status: 'failed', error: payload.error || 'Task failed' });
        source.close();
        isClosed = true;
      }
    } catch (error) {
      console.error('[taskService] Failed to parse SSE update:', error);
    }
  };

  source.onerror = () => {
    if (isClosed) return;
    source.close();
    isClosed = true;
    if (typeof onError === 'function') {
      onError();
    }
  };

  return () => {
    isClosed = true;
    source.close();
  };
};

const subscribeToTaskPolling = (taskId, onUpdate) => {
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
