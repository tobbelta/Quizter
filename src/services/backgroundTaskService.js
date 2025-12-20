/**
 * Background Task Service
 * 
 * Handles communication with Cloudflare API for background task monitoring.
 * Provides polling-based updates since Cloudflare Workers don't support WebSockets.
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

/**
 * Transform task from API format to frontend format
 */
const transformTask = (task) => {
  if (!task) return null;
  
  return {
    ...task,
    createdAt: task.createdAt ? new Date(task.createdAt) : null,
    updatedAt: task.updatedAt ? new Date(task.updatedAt) : null,
    finishedAt: task.finishedAt ? new Date(task.finishedAt) : null,
  };
};

/**
 * Fetch background tasks for a specific user
 */
const fetchUserTasks = async (userId) => {
  try {
    if (!userId) return [];
    
    const url = `${API_BASE_URL}/api/getBackgroundTasks?userId=${encodeURIComponent(userId)}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch tasks: ${response.statusText}`);
    }
    
    const data = await response.json();
    const tasks = data.tasks || [];
    return tasks.map(transformTask);
  } catch (error) {
    console.error('[backgroundTaskService] Error fetching user tasks:', error);
    throw error;
  }
};

/**
 * Fetch all background tasks (superuser)
 */
const fetchAllTasks = async () => {
  try {
    const url = `${API_BASE_URL}/api/getBackgroundTasks`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch tasks: ${response.statusText}`);
    }
    
    const data = await response.json();
    const tasks = data.tasks || [];
    return tasks.map(transformTask);
  } catch (error) {
    console.error('[backgroundTaskService] Error fetching all tasks:', error);
    throw error;
  }
};

const buildEventSourceUrl = (params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();
  return `${API_BASE_URL}/api/subscribeToTasks${query ? `?${query}` : ''}`;
};

const subscribeToTasksViaSSE = (params, callback, onError) => {
  if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
    return null;
  }

  const url = buildEventSourceUrl(params);
  const source = new EventSource(url);
  let isClosed = false;

  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data || '{}');
      if (!payload.success) {
        callback([], new Error(payload.error || 'SSE update failed'));
        return;
      }
      const tasks = (payload.tasks || []).map(transformTask);
      callback(tasks, null);
    } catch (error) {
      callback([], error);
    }
  };

  source.onerror = () => {
    if (isClosed) return;
    callback([], new Error('SSE connection error'));
    if (typeof onError === 'function') {
      onError();
    }
  };

  return () => {
    isClosed = true;
    source.close();
  };
};

const subscribeToUserTasksPolling = (userId, callback, options = {}) => {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const pollInterval = options.pollInterval || 2000; // Poll every 2 seconds
  let isActive = true;
  
  const poll = async () => {
    if (!isActive) return;
    
    try {
      const tasks = await fetchUserTasks(userId);
      callback(tasks, null);
    } catch (error) {
      callback([], error);
    }
    
    if (isActive) {
      setTimeout(poll, pollInterval);
    }
  };
  
  poll();
  
  return () => {
    isActive = false;
  };
};

const subscribeToAllTasksPolling = (callback, options = {}) => {
  const pollInterval = options.pollInterval || 3000; // Poll every 3 seconds
  let isActive = true;
  
  const poll = async () => {
    if (!isActive) return;
    
    try {
      const tasks = await fetchAllTasks();
      callback(tasks, null);
    } catch (error) {
      callback([], error);
    }
    
    if (isActive) {
      setTimeout(poll, pollInterval);
    }
  };
  
  poll();
  
  return () => {
    isActive = false;
  };
};

/**
 * Subscribe to user tasks (SSE first, fallback to polling)
 * Returns an unsubscribe function
 */
const subscribeToUserTasks = (userId, callback, options = {}) => {
  if (!userId) {
    callback([]);
    return () => {};
  }

  let pollUnsubscribe = null;
  let sseUnsubscribe = null;

  const handleSseError = () => {
    if (pollUnsubscribe) return;
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = null;
    }
    pollUnsubscribe = subscribeToUserTasksPolling(userId, callback, options);
  };

  sseUnsubscribe = subscribeToTasksViaSSE({ userId }, callback, handleSseError);
  if (!sseUnsubscribe) {
    return subscribeToUserTasksPolling(userId, callback, options);
  }

  return () => {
    if (sseUnsubscribe) sseUnsubscribe();
    if (pollUnsubscribe) pollUnsubscribe();
  };
};

/**
 * Subscribe to all tasks (SSE first, fallback to polling)
 * Returns an unsubscribe function
 */
const subscribeToAllTasks = (callback, options = {}) => {
  let pollUnsubscribe = null;
  let sseUnsubscribe = null;

  const handleSseError = () => {
    if (pollUnsubscribe) return;
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = null;
    }
    pollUnsubscribe = subscribeToAllTasksPolling(callback, options);
  };

  sseUnsubscribe = subscribeToTasksViaSSE({}, callback, handleSseError);
  if (!sseUnsubscribe) {
    return subscribeToAllTasksPolling(callback, options);
  }

  return () => {
    if (sseUnsubscribe) sseUnsubscribe();
    if (pollUnsubscribe) pollUnsubscribe();
  };
};

export const backgroundTaskService = {
  fetchUserTasks,
  fetchAllTasks,
  subscribeToUserTasks,
  subscribeToAllTasks,
};
