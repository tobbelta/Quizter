const INSTANCE_KEY = 'quizter:instanceId';
const ACTIVE_PREFIX = 'quizter:activeRun:';

const getStorage = (storageType) => {
  if (typeof window === 'undefined') return null;
  return storageType === 'session' ? window.sessionStorage : window.localStorage;
};

const buildKey = (runId) => `${ACTIVE_PREFIX}${runId}`;

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `instance_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const getInstanceId = () => {
  const storage = getStorage('session');
  if (!storage) return null;
  let instanceId = storage.getItem(INSTANCE_KEY);
  if (!instanceId) {
    instanceId = generateId();
    storage.setItem(INSTANCE_KEY, instanceId);
  }
  return instanceId;
};

const getActiveInstance = (runId) => {
  const storage = getStorage('local');
  if (!storage || !runId) return null;
  return storage.getItem(buildKey(runId));
};

const setActiveInstance = (runId, instanceId) => {
  const storage = getStorage('local');
  if (!storage || !runId || !instanceId) return null;
  storage.setItem(buildKey(runId), instanceId);
  return instanceId;
};

const releaseActiveInstance = (runId, instanceId) => {
  const storage = getStorage('local');
  if (!storage || !runId || !instanceId) return;
  const key = buildKey(runId);
  if (storage.getItem(key) === instanceId) {
    storage.removeItem(key);
  }
};

const subscribe = (runId, callback) => {
  if (typeof window === 'undefined' || !runId) return () => {};
  const key = buildKey(runId);
  const handler = (event) => {
    if (event.key !== key) return;
    callback(event.newValue || null);
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
};

export const runSessionService = {
  getInstanceId,
  getActiveInstance,
  setActiveInstance,
  releaseActiveInstance,
  subscribe,
};
