/**
 * LocalStorageService - Hanterar lokala rundor och spel för oinloggade användare
 *
 * ENDAST ID:n sparas lokalt - all rundata finns i backend-databasen.
 *
 * Datastruktur:
 * - quizter:local:createdRuns - Endast ID:n för rundor som användaren skapat
 * - quizter:local:joinedRuns - Endast runId + participantId för rundor användaren deltar i
 * - quizter:local:migrated - Flagga för om data har migrerats till konto
 */

const CREATED_RUNS_KEY = 'quizter:local:createdRuns';
const JOINED_RUNS_KEY = 'quizter:local:joinedRuns';
const MIGRATED_KEY = 'quizter:local:migrated';

/**
 * Säker localStorage-läsning
 */
const safeGet = (key) => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn(`[LocalStorage] Kunde inte läsa ${key}:`, error);
    return null;
  }
};

/**
 * Säker localStorage-skrivning
 */
const safeSet = (key, value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[LocalStorage] Kunde inte skriva ${key}:`, error);
  }
};

/**
 * Lägger till en skapad runda i localStorage
 * Sparar endast runId - all data finns i backend
 */
export const addCreatedRun = (runData) => {
  const runs = safeGet(CREATED_RUNS_KEY) || [];

  // Kontrollera om rundan redan finns
  const exists = runs.some(r => r.runId === runData.id);
  if (exists) {
    // Uppdatera timestamp
    const updated = runs.map(r =>
      r.runId === runData.id
        ? { ...r, updatedAt: Date.now() }
        : r
    );
    safeSet(CREATED_RUNS_KEY, updated);
  } else {
    // Lägg till endast ID
    runs.push({
      runId: runData.id,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    safeSet(CREATED_RUNS_KEY, runs);
  }
};

/**
 * Lägger till en deltagande runda i localStorage
 * Sparar endast runId + participantId - all data finns i backend
 */
export const addJoinedRun = (runData, participantData) => {
  const runs = safeGet(JOINED_RUNS_KEY) || [];

  // Kontrollera om deltagandet redan finns
  const exists = runs.some(r => r.runId === runData.id);
  if (exists) {
    // Uppdatera timestamp
    const updated = runs.map(r =>
      r.runId === runData.id
        ? { ...r, updatedAt: Date.now() }
        : r
    );
    safeSet(JOINED_RUNS_KEY, updated);
  } else {
    // Lägg till endast ID:n
    runs.push({
      runId: runData.id,
      participantId: participantData?.id || null,
      joinedAt: Date.now(),
      updatedAt: Date.now()
    });
    safeSet(JOINED_RUNS_KEY, runs);
  }
};

/**
 * Hämtar alla skapade rundor
 */
export const getCreatedRuns = () => {
  return safeGet(CREATED_RUNS_KEY) || [];
};

/**
 * Hämtar alla deltagna rundor
 */
export const getJoinedRuns = () => {
  return safeGet(JOINED_RUNS_KEY) || [];
};

/**
 * Kontrollerar om det finns lokala rundor att migrera
 */
export const hasLocalData = () => {
  const created = getCreatedRuns();
  const joined = getJoinedRuns();
  return created.length > 0 || joined.length > 0;
};

/**
 * Kontrollerar om data redan har migrerats
 */
export const hasBeenMigrated = () => {
  return safeGet(MIGRATED_KEY) === true;
};

/**
 * Markerar data som migrerad (förhindrar framtida migreringar)
 */
export const markAsMigrated = () => {
  safeSet(MIGRATED_KEY, true);
};

/**
 * Rensar all lokal data (används efter migrering om användaren vill)
 */
export const clearLocalData = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CREATED_RUNS_KEY);
    window.localStorage.removeItem(JOINED_RUNS_KEY);
  } catch (error) {
    console.warn('[LocalStorage] Kunde inte rensa lokal data:', error);
  }
};

/**
 * Hämtar all data för migrering
 */
export const getDataForMigration = () => {
  return {
    createdRuns: getCreatedRuns(),
    joinedRuns: getJoinedRuns(),
    hasMigrated: hasBeenMigrated()
  };
};

/**
 * Uppdaterar timestamp på en skapad runda
 */
export const updateCreatedRunStatus = (runId) => {
  const runs = getCreatedRuns();
  const updated = runs.map(r =>
    r.runId === runId
      ? { ...r, updatedAt: Date.now() }
      : r
  );
  safeSet(CREATED_RUNS_KEY, updated);
};

/**
 * Uppdaterar timestamp på en deltagen runda
 */
export const updateJoinedRunProgress = (runId) => {
  const runs = getJoinedRuns();
  const updated = runs.map(r =>
    r.runId === runId
      ? { ...r, updatedAt: Date.now() }
      : r
  );
  safeSet(JOINED_RUNS_KEY, updated);
};

export const localStorageService = {
  addCreatedRun,
  addJoinedRun,
  getCreatedRuns,
  getJoinedRuns,
  hasLocalData,
  hasBeenMigrated,
  markAsMigrated,
  clearLocalData,
  getDataForMigration,
  updateCreatedRunStatus,
  updateJoinedRunProgress
};