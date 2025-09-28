/**
 * Lokal implementation av runRepository som använder localStorage för demo/offline-läge.
 * Varje hjälpfunktion dokumenteras så att man ser hur data sparas och delas mellan flikar.
 */
import { v4 as uuidv4 } from 'uuid';
import { buildHostedRun, buildGeneratedRun } from './runFactory';

const RUN_STORAGE_KEY = 'tipspromenad:runs';
const PARTICIPANT_STORAGE_KEY = 'tipspromenad:participants';
export const PARTICIPANT_TIMEOUT_MS = 60000;

/**
 * Läser ett JSON-värde från localStorage om det finns kvar sedan tidigare.
 * Används för att fånga upp sparade rundor eller deltagare när appen laddas om.
 */
const readJson = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Kunde inte läsa från localStorage', error);
    return fallback;
  }
};

/**
 * Skriver ett JSON-värde till localStorage så att läget finns kvar mellan sessioner.
 * Vi använder en skyddad variant som sväljer eventuella storage-fel.
 */
const writeJson = (key, value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Kunde inte skriva till localStorage', error);
  }
};

let cachedRuns = null;
let cachedParticipants = null;

/**
 * Ser till att minnescacherna laddas en gång från localStorage innan vi jobbar vidare.
 * Hindrar att vi blandar gammal data med uppdateringar i samma körning.
 */
const ensureCachesLoaded = () => {
  if (cachedRuns === null) {
    cachedRuns = typeof window === 'undefined' ? [] : readJson(RUN_STORAGE_KEY, []);
  }
  if (cachedParticipants === null) {
    cachedParticipants = typeof window === 'undefined' ? [] : readJson(PARTICIPANT_STORAGE_KEY, []);
  }
};

const runListeners = new Set();
const participantListeners = new Map();

/**
 * Returnerar en klonad lista av sparade rundor för att undvika mutation av källan.
 */
const cloneRuns = () => {
  ensureCachesLoaded();
  return cachedRuns.map((run) => ({ ...run }));
};

/**
 * Utökar en deltagare med statusflaggor (aktiv, inaktiv, klar) baserat på tidsstämplar.
 */
const enrichParticipant = (participant) => {
  const now = Date.now();
  const lastSeenMs = participant.lastSeen ? new Date(participant.lastSeen).getTime() : 0;
  const completedAtMs = participant.completedAt ? new Date(participant.completedAt).getTime() : null;
  const isFinished = Boolean(completedAtMs);
  const isActive = !isFinished && now - lastSeenMs < PARTICIPANT_TIMEOUT_MS;
  const status = isFinished ? 'finished' : (isActive ? 'active' : 'inactive');

  return {
    ...participant,
    lastSeen: participant.lastSeen,
    isActive,
    status
  };
};

/**
 * Hämtar alla deltagare för en viss runda och beräknar deras status.
 */
const participantsForRun = (runId) => {
  ensureCachesLoaded();
  return cachedParticipants
    .filter((participant) => participant.runId === runId)
    .map(enrichParticipant);
};

/**
 * Meddelar alla lyssnare att run-listan har ändrats.
 */
function notifyRuns() {
  const snapshot = cloneRuns();
  runListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.warn('Run-lyssnare kastade fel', error);
    }
  });
}

/**
 * Skickar uppdaterad deltagarlista till lyssnarna för en specifik runda.
 */
function notifyParticipants(runId) {
  const listeners = participantListeners.get(runId);
  if (!listeners || listeners.size === 0) return;
  const snapshot = participantsForRun(runId);
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.warn('Deltagar-lyssnare kastade fel', error);
    }
  });
}

/**
 * Uppdaterar samtliga öppna deltagarlyssnare. Praktiskt vid storage-event.
 */
function notifyParticipantsForAll() {
  participantListeners.forEach((listeners, runId) => {
    if (listeners.size > 0) {
      notifyParticipants(runId);
    }
  });
}

/**
 * Lyssnar på storage-event så att flera flikar hålls synkade runt samma localStorage-data.
 */
const ensureStorageListeners = (() => {
  let isBound = false;
  return () => {
    if (isBound || typeof window === 'undefined') return;
    window.addEventListener('storage', (event) => {
      if (event.key === RUN_STORAGE_KEY) {
        cachedRuns = readJson(RUN_STORAGE_KEY, []);
        notifyRuns();
      }
      if (event.key === PARTICIPANT_STORAGE_KEY) {
        cachedParticipants = readJson(PARTICIPANT_STORAGE_KEY, []);
        notifyParticipantsForAll();
      }
    });
    isBound = true;
  };
})();

/**
 * Sparar rundorna i cache och localStorage och signalerar till lyssnarna.
 */
const persistRuns = (runs) => {
  ensureCachesLoaded();
  cachedRuns = [...runs];
  writeJson(RUN_STORAGE_KEY, cachedRuns);
  notifyRuns();
};

/**
 * Uppdaterar deltagarlistan, sparar och triggar notifieringar för berörda rundor.
 */
const persistParticipants = (participants, affectedRunIds = []) => {
  ensureCachesLoaded();
  cachedParticipants = [...participants];
  writeJson(PARTICIPANT_STORAGE_KEY, cachedParticipants);
  if (affectedRunIds.length > 0) {
    affectedRunIds.forEach((runId) => notifyParticipants(runId));
  } else {
    notifyParticipantsForAll();
  }
};

/**
 * Hämtar en enskild runda från cachen.
 */
const getRunById = (runId) => {
  ensureCachesLoaded();
  return cachedRuns.find((run) => run.id === runId) || null;
};

ensureStorageListeners();
ensureCachesLoaded();

export const runService = {
  /**
   * Returnerar alla rundor som finns i localStorage-cachen.
   */
  listRuns: () => cloneRuns(),

  /**
   * Letar upp en specifik runda via id och ger tillbaka en kopia.
   */
  getRun: (runId) => getRunById(runId),

  /**
   * Hämtar en runda via anslutningskod (joinCode). Koder lagras i versaler.
   */
  getRunByCode: (joinCode) => {
    const upperCode = joinCode.toUpperCase();
    return cloneRuns().find((run) => run.joinCode === upperCode) || null;
  },

  /**
   * Skapar en administratörsstyrd runda och sparar den lokalt.
   */
  createRun: (payload, creator) => {
    ensureCachesLoaded();
    const runs = cloneRuns();
    const run = buildHostedRun(payload, creator);
    persistRuns([...runs, run]);
    return run;
  },

  /**
   * Genererar en runda åt användaren baserat på vald svårighet och längd.
   */
  generateRouteRun: (payload, creator) => {
    ensureCachesLoaded();
    const runs = cloneRuns();
    const run = buildGeneratedRun(payload, creator);
    persistRuns([...runs, run]);
    return run;
  },

  /**
   * Returnerar den aktuella deltagarlistan för en runda.
   */
  listParticipants: (runId) => participantsForRun(runId),

  /**
   * Registrerar en ny deltagare och markerar starttid samt initial status.
   */
  registerParticipant: (runId, { userId, alias, contact, isAnonymous }) => {
    ensureCachesLoaded();
    const run = getRunById(runId);
    if (!run) {
      throw new Error('Rundan hittades inte.');
    }

    if (!run.allowAnonymous && isAnonymous) {
      throw new Error('Anonyma deltagare är inte tillåtna för denna runda.');
    }

    const now = new Date().toISOString();
    const participant = {
      id: uuidv4(),
      runId,
      userId: userId || null,
      alias: alias || 'Gäst',
      contact: contact || null,
      isAnonymous: Boolean(isAnonymous),
      joinedAt: now,
      completedAt: null,
      currentOrder: 1,
      score: 0,
      answers: [],
      lastSeen: now
    };

    persistParticipants([...cachedParticipants, participant], [runId]);
    return enrichParticipant(participant);
  },

  /**
   * Sparar ett svar från en deltagare och uppdaterar poäng samt progression.
   */
  recordAnswer: (runId, participantId, { questionId, answerIndex, correct }) => {
    ensureCachesLoaded();
    const run = getRunById(runId);
    if (!run) {
      throw new Error('Rundan hittades inte.');
    }

    let updated = null;
    const now = new Date().toISOString();
    const nextParticipants = cachedParticipants.map((participant) => {
      if (participant.id !== participantId) {
        return participant;
      }

      const answers = [...participant.answers];
      const existingIndex = answers.findIndex((entry) => entry.questionId === questionId);
      if (existingIndex >= 0) {
        answers[existingIndex] = { ...answers[existingIndex], answerIndex, correct, answeredAt: now };
      } else {
        answers.push({ questionId, answerIndex, correct, answeredAt: now });
      }

      const score = answers.filter((entry) => entry.correct).length;
      updated = {
        ...participant,
        answers,
        score,
        currentOrder: answers.length + 1,
        completedAt: answers.length === run.questionIds.length ? now : participant.completedAt,
        lastSeen: now
      };
      return updated;
    });

    persistParticipants(nextParticipants, [runId]);
    return updated ? enrichParticipant(updated) : null;
  },

  /**
   * Markerar en deltagare som färdig och sparar sluttid.
   */
  completeRun: (runId, participantId) => {
    ensureCachesLoaded();
    const now = new Date().toISOString();
    const nextParticipants = cachedParticipants.map((participant) => {
      if (participant.id !== participantId) return participant;
      return {
        ...participant,
        completedAt: now,
        lastSeen: now
      };
    });
    persistParticipants(nextParticipants, [runId]);
  },

  /**
   * Stänger en runda för vidare spel så att administratören kan publicera resultat.
   */
  closeRun: (runId) => {
    ensureCachesLoaded();
    const nextRuns = cachedRuns.map((run) => (run.id === runId
      ? { ...run, status: 'closed', closedAt: new Date().toISOString() }
      : run));
    persistRuns(nextRuns);
  },

  /**
   * Låter komponenter lyssna på ändringar i run-listan i realtid.
   */
  subscribeRuns: (listener) => {
    ensureStorageListeners();
    runListeners.add(listener);
    listener(cloneRuns());
    return () => {
      runListeners.delete(listener);
    };
  },

  /**
   * Lyssnar på deltagaruppdateringar för en specifik runda.
   */
  subscribeParticipants: (runId, listener) => {
    ensureStorageListeners();
    const existing = participantListeners.get(runId) || new Set();
    existing.add(listener);
    participantListeners.set(runId, existing);
    listener(participantsForRun(runId));
    return () => {
      const current = participantListeners.get(runId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        participantListeners.delete(runId);
      }
    };
  },

  /**
   * Uppdaterar deltagarens senaste aktivitetstid för att hålla status grön.
   */
  heartbeatParticipant: (runId, participantId) => {
    ensureCachesLoaded();
    const now = new Date().toISOString();
    let updated = null;
    const nextParticipants = cachedParticipants.map((participant) => {
      if (participant.id !== participantId) return participant;
      updated = { ...participant, lastSeen: now };
      return updated;
    });
    if (updated) {
      persistParticipants(nextParticipants, [runId]);
    }
    return updated ? enrichParticipant(updated) : null;
  },

  /**
   * Hämtar en enskild deltagare och berikar den med status-info.
   */
  getParticipant: (runId, participantId) => {
    ensureCachesLoaded();
    const participant = cachedParticipants.find((entry) => entry.runId === runId && entry.id === participantId) || null;
    return participant ? enrichParticipant(participant) : null;
  }
};








