// Stub: Legacy Firestore task service is now disabled. All logic moved to Cloudflare API endpoints.
import { backgroundTaskService } from './backgroundTaskService';

const subscribeToTask = (taskId, onUpdate, onComplete, onError) => {
  // Use SSE-based subscription
  return backgroundTaskService.subscribeToTask(taskId, onUpdate, onComplete, onError);
};

const waitForCompletion = async (taskId) => {
  return new Promise((resolve, reject) => {
    const cleanup = backgroundTaskService.subscribeToTask(
      taskId,
      (task) => {
        // Update received, just log it
        console.log('[taskService] Task update:', task);
      },
      (task) => {
        // Complete
        cleanup();
        resolve(task);
      },
      (error) => {
        // Error
        cleanup();
        reject(new Error(error));
      }
    );
  });
};

// ...existing code...

export const taskService = {
  subscribeToTask,
  waitForCompletion,
};
