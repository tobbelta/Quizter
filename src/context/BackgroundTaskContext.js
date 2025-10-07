import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { backgroundTaskService } from '../services/backgroundTaskService';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const BackgroundTaskContext = createContext({
  myTasks: [],
  myTrackedTasks: [],
  unreadTaskIds: new Set(),
  unreadCount: 0,
  hasActiveTrackedTasks: false,
  registerTask: () => {},
  markTaskAsSeen: () => {},
  markAllTasksAsSeen: () => {},
  allTasks: [],
});

const FINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const STATUS_VARIANT = {
  completed: 'success',
  failed: 'error',
  cancelled: 'warning',
};

const safeParseJSON = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('[BackgroundTaskContext] Failed to parse JSON from storage:', error);
    return fallback;
  }
};

export const BackgroundTaskProvider = ({ children }) => {
  const { currentUser, isSuperUser } = useAuth();
  const { pushToast } = useToast();
  const [userTasksSnapshot, setUserTasksSnapshot] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [trackedEntries, setTrackedEntries] = useState([]);
  const unseenTaskIdsRef = useRef(new Set());
  const [unseenTaskIdsState, setUnseenTaskIdsState] = useState(new Set());
  const statusHistoryRef = useRef({});
  const notifiedStatusesRef = useRef(new Set());
  const initializedRef = useRef(false);
  const trackedTasksRef = useRef(new Map());
  const acknowledgedTaskIdsRef = useRef(new Set());
  const storageKeysRef = useRef({ tracked: null, acknowledged: null });

  // Helpers to persist data in localStorage
  const persistTrackedTasks = useCallback(() => {
    if (typeof window === 'undefined') return;
    const { tracked } = storageKeysRef.current;
    if (!tracked) return;

    const payload = Array.from(trackedTasksRef.current.entries()).reduce((acc, [taskId, meta]) => {
      acc[taskId] = {
        ...meta,
        createdAt: meta.createdAt instanceof Date ? meta.createdAt.toISOString() : meta.createdAt ?? null,
      };
      return acc;
    }, {});

    localStorage.setItem(tracked, JSON.stringify(payload));
  }, []);

  const persistAcknowledgedTasks = useCallback(() => {
    if (typeof window === 'undefined') return;
    const { acknowledged } = storageKeysRef.current;
    if (!acknowledged) return;

    const payload = Array.from(acknowledgedTaskIdsRef.current);
    localStorage.setItem(acknowledged, JSON.stringify(payload));
  }, []);

  const clearNotifiedForTask = useCallback((taskId) => {
    if (!taskId) return;
    notifiedStatusesRef.current.forEach((statusKey) => {
      if (statusKey.startsWith(`${taskId}:`)) {
        notifiedStatusesRef.current.delete(statusKey);
      }
    });
  }, []);

  const resetState = useCallback(() => {
    setUserTasksSnapshot([]);
    setAllTasks([]);
    trackedTasksRef.current = new Map();
    acknowledgedTaskIdsRef.current = new Set();
    unseenTaskIdsRef.current = new Set();
    setUnseenTaskIdsState(new Set());
    statusHistoryRef.current = {};
    notifiedStatusesRef.current = new Set();
    initializedRef.current = false;
    storageKeysRef.current = { tracked: null, acknowledged: null };
    setTrackedEntries([]);
  }, []);

  // Handle auth changes
  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous) {
      resetState();
      return () => {};
    }

    const trackedKey = `geoquest:tasks:tracked:${currentUser.uid}`;
    const acknowledgedKey = `geoquest:tasks:ack:${currentUser.uid}`;
    storageKeysRef.current = { tracked: trackedKey, acknowledged: acknowledgedKey };

    const storedTracked = safeParseJSON(
      typeof window !== 'undefined' ? localStorage.getItem(trackedKey) : null,
      {},
    );
    const restoredTracked = new Map();
    Object.entries(storedTracked).forEach(([taskId, meta]) => {
      restoredTracked.set(taskId, {
        taskType: meta.taskType,
        label: meta.label,
        description: meta.description,
        createdAt: meta.createdAt ? new Date(meta.createdAt) : new Date(),
      });
    });
    trackedTasksRef.current = restoredTracked;

    const storedAck = safeParseJSON(
      typeof window !== 'undefined' ? localStorage.getItem(acknowledgedKey) : null,
      [],
    );
    acknowledgedTaskIdsRef.current = new Set(storedAck);
    setTrackedEntries(Array.from(restoredTracked.entries()));

    const unsubscribe = backgroundTaskService.subscribeToUserTasks(
      currentUser.uid,
      (tasks) => {
        setUserTasksSnapshot(tasks);

        const statusMap = {};
        tasks.forEach((task) => {
          statusMap[task.id] = task.status;
        });

        if (!initializedRef.current) {
          statusHistoryRef.current = statusMap;
          initializedRef.current = true;
          return;
        }

        const nextUnseen = new Set(unseenTaskIdsRef.current);

        tasks.forEach((task) => {
          const previousStatus = statusHistoryRef.current[task.id];
          const statusChanged = task.status !== previousStatus;
          const isTracked = trackedTasksRef.current.has(task.id);
          const isFinal = FINAL_STATUSES.has(task.status);
          statusHistoryRef.current[task.id] = task.status;

          if (isTracked && isFinal && statusChanged) {
            if (!acknowledgedTaskIdsRef.current.has(task.id)) {
              nextUnseen.add(task.id);
            }

            if (isSuperUser) {
              const notificationKey = `${task.id}:${task.status}`;
              if (!notifiedStatusesRef.current.has(notificationKey)) {
                const meta = trackedTasksRef.current.get(task.id) || {};
                const variant = STATUS_VARIANT[task.status] || 'info';
                const baseTitle = meta.label || (task.taskType === 'generation' ? 'AI-generering' : 'AI-validering');
                const messageParts = [];
                if (task.status === 'completed') {
                  messageParts.push('Bakgrundsjobbet är klart.');
                  if (task.result?.count != null) {
                    messageParts.push(`Resultat: ${task.result.count}.`);
                  }
                }
                if (task.status === 'failed') {
                  messageParts.push('Bakgrundsjobbet misslyckades.');
                  if (task.error) {
                    messageParts.push(task.error);
                  }
                }
                if (task.status === 'cancelled') {
                  messageParts.push('Bakgrundsjobbet avbröts.');
                }

                pushToast({
                  title: baseTitle,
                  message: messageParts.join('\n'),
                  variant,
                });
                notifiedStatusesRef.current.add(notificationKey);
              }
            }
          }
        });

        // Clean up unseen set for tasks no longer tracked or acknowledged
        Array.from(nextUnseen).forEach((taskId) => {
          if (
            !trackedTasksRef.current.has(taskId) ||
            acknowledgedTaskIdsRef.current.has(taskId)
          ) {
            nextUnseen.delete(taskId);
          }
        });

        unseenTaskIdsRef.current = nextUnseen;
        setUnseenTaskIdsState(new Set(nextUnseen));
      },
    );

    return () => {
      unsubscribe();
      resetState();
    };
  }, [currentUser, isSuperUser, pushToast, resetState]);

  // Superuser: subscribe to global task list
  useEffect(() => {
    if (!isSuperUser) {
      setAllTasks([]);
      return () => {};
    }

    const unsubscribe = backgroundTaskService.subscribeToAllTasks((tasks) => {
      setAllTasks(tasks);
    });

    return () => unsubscribe();
  }, [isSuperUser]);

  const registerTask = useCallback((taskId, metadata) => {
    if (!taskId || !metadata || !currentUser || currentUser.isAnonymous) {
      return;
    }

    const existing = trackedTasksRef.current.get(taskId);
    const mergedMeta = {
      taskType: metadata.taskType || existing?.taskType || 'task',
      label: metadata.label || existing?.label || 'Bakgrundsjobb',
      description: metadata.description || existing?.description || null,
      createdAt: metadata.createdAt
        ? new Date(metadata.createdAt)
        : existing?.createdAt || new Date(),
    };

    clearNotifiedForTask(taskId);
    trackedTasksRef.current.set(taskId, mergedMeta);
    acknowledgedTaskIdsRef.current.delete(taskId);
    persistTrackedTasks();
    persistAcknowledgedTasks();
    setTrackedEntries(Array.from(trackedTasksRef.current.entries()));
  }, [clearNotifiedForTask, currentUser, persistAcknowledgedTasks, persistTrackedTasks]);

  const markTaskAsSeen = useCallback((taskId) => {
    if (!taskId || !currentUser || currentUser.isAnonymous) return;

    acknowledgedTaskIdsRef.current.add(taskId);
    trackedTasksRef.current.delete(taskId);
    persistTrackedTasks();
    persistAcknowledgedTasks();

    const nextUnseen = new Set(unseenTaskIdsRef.current);
    nextUnseen.delete(taskId);
    unseenTaskIdsRef.current = nextUnseen;
    setUnseenTaskIdsState(new Set(nextUnseen));
    setTrackedEntries(Array.from(trackedTasksRef.current.entries()));
    clearNotifiedForTask(taskId);
  }, [clearNotifiedForTask, currentUser, persistAcknowledgedTasks, persistTrackedTasks]);

  const markAllTasksAsSeen = useCallback(() => {
    if (!currentUser || currentUser.isAnonymous) return;

    userTasksSnapshot.forEach((task) => {
      if (FINAL_STATUSES.has(task.status)) {
        acknowledgedTaskIdsRef.current.add(task.id);
        trackedTasksRef.current.delete(task.id);
        clearNotifiedForTask(task.id);
      }
    });

    persistTrackedTasks();
    persistAcknowledgedTasks();
    unseenTaskIdsRef.current = new Set();
    setUnseenTaskIdsState(new Set());
    setTrackedEntries(Array.from(trackedTasksRef.current.entries()));
  }, [clearNotifiedForTask, currentUser, persistAcknowledgedTasks, persistTrackedTasks, userTasksSnapshot]);

  const myTrackedTasks = useMemo(() => {
    if (trackedEntries.length === 0 && userTasksSnapshot.length === 0) {
      return [];
    }

    const snapshotMap = userTasksSnapshot.reduce((acc, task) => {
      acc.set(task.id, task);
      return acc;
    }, new Map());

    const combined = trackedEntries.map(([taskId, meta]) => {
      const firestoreTask = snapshotMap.get(taskId);
      const createdAt = firestoreTask?.createdAt || meta.createdAt || null;
      const status = firestoreTask?.status || 'queued';
      return {
        id: taskId,
        taskType: firestoreTask?.taskType || meta.taskType || 'task',
        status,
        label: meta.label || firestoreTask?.taskType || 'Bakgrundsjobb',
        description: meta.description || firestoreTask?.description || null,
        createdAt,
        startedAt: firestoreTask?.startedAt || null,
        finishedAt: firestoreTask?.finishedAt || null,
        userId: firestoreTask?.userId || currentUser?.uid,
        payload: firestoreTask?.payload,
        result: firestoreTask?.result,
        error: firestoreTask?.error,
        statusHistory: firestoreTask?.statusHistory,
        tracked: true,
      };
    });

    combined.sort((a, b) => {
      const timeA = a.createdAt ? a.createdAt.getTime() : 0;
      const timeB = b.createdAt ? b.createdAt.getTime() : 0;
      return timeB - timeA;
    });

    return combined;
  }, [currentUser, trackedEntries, userTasksSnapshot]);

  const unreadTaskIds = useMemo(() => new Set(unseenTaskIdsState), [unseenTaskIdsState]);
  const unreadCount = unreadTaskIds.size;
  const hasActiveTrackedTasks = myTrackedTasks.some((task) => !FINAL_STATUSES.has(task.status));

  const contextValue = useMemo(() => ({
    myTasks: userTasksSnapshot,
    myTrackedTasks,
    unreadTaskIds,
    unreadCount,
    hasActiveTrackedTasks,
    registerTask,
    markTaskAsSeen,
    markAllTasksAsSeen,
    allTasks,
  }), [
    allTasks,
    hasActiveTrackedTasks,
    markAllTasksAsSeen,
    markTaskAsSeen,
    myTrackedTasks,
    registerTask,
    unreadCount,
    unreadTaskIds,
    userTasksSnapshot,
  ]);

  return (
    <BackgroundTaskContext.Provider value={contextValue}>
      {children}
    </BackgroundTaskContext.Provider>
  );
};

export const useBackgroundTasks = () => useContext(BackgroundTaskContext);
