/**
 * Background Task Service
 * 
 * Handles communication with Cloudflare API for background task monitoring.
 * Provides polling-based updates since Cloudflare Workers don't support WebSockets.
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

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
    return data.tasks || [];
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
    return data.tasks || [];
  } catch (error) {
    console.error('[backgroundTaskService] Error fetching all tasks:', error);
    throw error;
  }
};

/**
 * Subscribe to user tasks with polling
 * Returns an unsubscribe function
 */
const subscribeToUserTasks = (userId, callback, options = {}) => {
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
  
  // Start polling
  poll();
  
  // Return unsubscribe function
  return () => {
    isActive = false;
  };
};

/**
 * Subscribe to all tasks with polling (superuser)
 * Returns an unsubscribe function
 */
const subscribeToAllTasks = (callback, options = {}) => {
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
  
  // Start polling
  poll();
  
  // Return unsubscribe function
  return () => {
    isActive = false;
  };
};

export const backgroundTaskService = {
  fetchUserTasks,
  fetchAllTasks,
  subscribeToUserTasks,
  subscribeToAllTasks,
};


