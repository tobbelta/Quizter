// Stub: Legacy Firestore task service is now disabled. All logic moved to Cloudflare API endpoints.
const subscribeToTask = () => () => {};
const waitForCompletion = async () => { throw new Error('Legacy taskService disabled'); };

// ...existing code...

export const taskService = {
  subscribeToTask,
  waitForCompletion,
};
