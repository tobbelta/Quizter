import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import MessageDialog from '../components/shared/MessageDialog';
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
  refreshUserTasks: () => {},
  refreshAllTasks: () => {},
});

const FINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const STATUS_VARIANT = {
  completed: 'success',
  failed: 'error',
  cancelled: 'warning',
};

const PROVIDER_LABELS = {
  random: 'slumpad provider',
  gemini: 'Gemini',
  anthropic: 'Claude',
  openai: 'OpenAI',
};

const INITIAL_COMPLETION_DIALOG = {
  isOpen: false,
  title: '',
  message: '',
  type: 'info',
};

const buildGenerationCompletionMessage = (task = {}) => {
  const providerRaw =
    (typeof task.result?.provider === 'string' && task.result.provider) ||
    (typeof task.payload?.provider === 'string' && task.payload.provider) ||
    'AI';
  const providerKey = providerRaw.toLowerCase();
  const providerLabel = PROVIDER_LABELS[providerKey] || providerRaw;

  const lines = [];
  lines.push(`AI-generering via ${providerLabel} klar!`);

  if (typeof task.result?.count === 'number') {
    lines.push(`${task.result.count} frågor genererades.`);
  }

  if (Array.isArray(task.result?.questionIds) && task.result.questionIds.length > 0) {
    lines.push('Frågorna importeras och visas i listan när synken är klar.');
  }

  return lines.join('\n\n');
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
  const [completionDialog, setCompletionDialog] = useState(() => ({ ...INITIAL_COMPLETION_DIALOG }));
  const statusHistoryRef = useRef({});
  const notifiedStatusesRef = useRef(new Set());
  const initializedRef = useRef(false);
  const trackedTasksRef = useRef(new Map());
  const acknowledgedTaskIdsRef = useRef(new Set());
  const storageKeysRef = useRef({ tracked: null, acknowledged: null });
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

const handleTaskSnapshot = useCallback((tasks) => {
  if (!isMountedRef.current) return;

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
          const getTitle = () => {
            if (meta.label) return meta.label;
            if (task.taskType === 'generation') return 'AI-generering';
            if (task.taskType === 'validation') return 'AI-validering';
            if (task.taskType === 'regenerateemoji') return 'Emoji-regenerering';
            if (task.taskType === 'batchregenerateemojis') return 'Mass-regenerering Emojis';
            return 'Bakgrundsjobb';
          };
          const baseTitle = getTitle();
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

          if (task.taskType === 'generation' && task.status === 'completed') {
            const message = buildGenerationCompletionMessage(task);
            setCompletionDialog({
              isOpen: true,
              title: 'AI-generering klar',
              message,
              type: 'success',
            });
          }
          notifiedStatusesRef.current.add(notificationKey);
        }
      }
    }
  });

  Array.from(nextUnseen).forEach((taskId) => {
    if (!trackedTasksRef.current.has(taskId) || acknowledgedTaskIdsRef.current.has(taskId)) {
      nextUnseen.delete(taskId);
    }
  });

  unseenTaskIdsRef.current = nextUnseen;
  setUnseenTaskIdsState(new Set(nextUnseen));
  statusHistoryRef.current = statusMap;
}, [isSuperUser, pushToast]);

const refreshUserTasks = useCallback(async () => {
  if (!currentUser || currentUser.isAnonymous) return;
  try {
    const tasks = await backgroundTaskService.fetchUserTasks(currentUser.uid);
    handleTaskSnapshot(tasks);
  } catch (error) {
    console.error('[BackgroundTaskContext] Failed to fetch user background tasks:', error);
  }
}, [currentUser, handleTaskSnapshot]);

const refreshAllTasks = useCallback(async () => {
  if (!isSuperUser) return;
  try {
    const tasks = await backgroundTaskService.fetchAllTasks();
    if (!isMountedRef.current) return;
    setAllTasks(tasks);
  } catch (error) {
    console.error('[BackgroundTaskContext] Failed to fetch global background tasks:', error);
  }
}, [isSuperUser]);


  // Handle auth changes
  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous) {
      resetState();
      return undefined;
    }

    resetState();

    const trackedKey = `quizter:tasks:tracked:${currentUser.uid}`;
    const acknowledgedKey = `quizter:tasks:ack:${currentUser.uid}`;
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

    statusHistoryRef.current = {};
    initializedRef.current = false;

    const unsubscribe = backgroundTaskService.subscribeToUserTasks(
      currentUser.uid,
      (tasks, error) => {
        if (!isMountedRef.current) {
          return;
        }
        if (error) {
          console.error('[BackgroundTaskContext] Realtime user-task subscription failed:', error);
          return;
        }
        handleTaskSnapshot(tasks);
      },
    );

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [currentUser, handleTaskSnapshot, resetState]);


  // Superuser: realtime subscription to global task list
  useEffect(() => {
    if (!isSuperUser) {
      setAllTasks([]);
      return undefined;
    }

    const unsubscribe = backgroundTaskService.subscribeToAllTasks((tasks, error) => {
      if (!isMountedRef.current) {
        return;
      }
      if (error) {
        console.error('[BackgroundTaskContext] Realtime all-task subscription failed:', error);
        return;
      }
      setAllTasks(tasks);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
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
    refreshUserTasks();
  }, [clearNotifiedForTask, currentUser, persistAcknowledgedTasks, persistTrackedTasks, refreshUserTasks]);

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

    // Create map of localStorage tasks
    const trackedMap = new Map(trackedEntries);
    
    // Create map of API tasks
    const snapshotMap = userTasksSnapshot.reduce((acc, task) => {
      acc.set(task.id, task);
      return acc;
    }, new Map());

    // Use API data as source of truth, fall back to localStorage for tasks not in API
    const allTaskIds = new Set([
      ...Array.from(snapshotMap.keys()),
      ...Array.from(trackedMap.keys())
    ]);

    const combined = Array.from(allTaskIds).map(taskId => {
      const apiTask = snapshotMap.get(taskId);
      const meta = trackedMap.get(taskId);
      
      // Prefer API data, fall back to localStorage
      const createdAt = apiTask?.createdAt || meta?.createdAt || null;
      const status = apiTask?.status || 'queued';
      
      return {
        id: taskId,
        taskType: apiTask?.taskType || meta?.taskType || 'task',
        status,
        label: apiTask?.label || meta?.label || 'Bakgrundsjobb',
        description: apiTask?.description || meta?.description || null,
        createdAt,
        startedAt: apiTask?.startedAt || null,
        finishedAt: apiTask?.finishedAt || null,
        userId: apiTask?.userId || currentUser?.uid,
        payload: apiTask?.payload,
        result: apiTask?.result,
        error: apiTask?.error,
        progress: apiTask?.progress,
        statusHistory: apiTask?.statusHistory,
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
    refreshUserTasks,
    refreshAllTasks,
  }), [
    allTasks,
    hasActiveTrackedTasks,
    markAllTasksAsSeen,
    markTaskAsSeen,
    myTrackedTasks,
    registerTask,
    refreshAllTasks,
    refreshUserTasks,
    unreadCount,
    unreadTaskIds,
    userTasksSnapshot,
  ]);

  return (
    <BackgroundTaskContext.Provider value={contextValue}>
      {children}
      <MessageDialog
        isOpen={completionDialog.isOpen}
        onClose={() => setCompletionDialog({ ...INITIAL_COMPLETION_DIALOG })}
        title={completionDialog.title}
        message={completionDialog.message}
        type={completionDialog.type}
      />
    </BackgroundTaskContext.Provider>
  );
};

export const useBackgroundTasks = () => useContext(BackgroundTaskContext);
