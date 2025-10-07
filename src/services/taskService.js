/**
 * Service for interacting with the backgroundTasks collection in Firestore.
 */
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseClient";

const subscribeToTask = (taskId, callback) => {
  if (!taskId) {
    console.error("subscribeToTask called with no taskId.");
    return () => {}; // Return a no-op unsubscribe function
  }

  const taskDocRef = doc(db, "backgroundTasks", taskId);

  const unsubscribe = onSnapshot(
    taskDocRef,
    (docSnapshot) => {
      if (docSnapshot.exists()) {
        callback({ id: docSnapshot.id, ...docSnapshot.data() });
      } else {
        console.warn(`Task with ID ${taskId} not found.`);
        callback(null);
      }
    },
    (error) => {
      console.error(`Error listening to task ${taskId}:`, error);
    }
  );

  return unsubscribe;
};

const waitForCompletion = (taskId) => {
  if (!taskId) {
    return Promise.reject(new Error("No taskId provided"));
  }

  return new Promise((resolve, reject) => {
    const unsubscribe = subscribeToTask(taskId, (taskData) => {
      if (!taskData) {
        return;
      }

      if (taskData.status === "completed") {
        unsubscribe();
        resolve(taskData);
      } else if (taskData.status === "failed" || taskData.status === "cancelled") {
        const errorMessage = taskData.error || "Background task failed";
        unsubscribe();
        reject(new Error(errorMessage));
      }
    });
  });
};

export const taskService = {
  subscribeToTask,
  waitForCompletion,
};
