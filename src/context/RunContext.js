/**
 * Delar pågående run-data mellan sidor och kapslar realtidslyssning.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { runRepository } from '../repositories/runRepository';
import { questionService } from '../services/questionService';

const RunContext = createContext();

const ACTIVE_PARTICIPANT_KEY = 'tipspromenad:activeParticipant';

/** Plockar upp senast aktiva deltagaren från localStorage. */
const readActiveParticipant = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_PARTICIPANT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Kunde inte läsa aktiv deltagare från storage', error);
    return null;
  }
};

/** Sparar eller rensar kopplingen mellan användare och runda. */
const writeActiveParticipant = (payload) => {
  if (typeof window === 'undefined') return;
  try {
    if (!payload) {
      window.localStorage.removeItem(ACTIVE_PARTICIPANT_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_PARTICIPANT_KEY, JSON.stringify(payload));
    }
  } catch (error) {
    console.warn('Kunde inte skriva aktiv deltagare till storage', error);
  }
};

/** Översätter runens fråge-id till faktiska frågeobjekt. */
const mapRunQuestions = (run) => {
  if (!run) return [];
  return questionService.getManyByIds(run.questionIds);
};

export const RunProvider = ({ children }) => {
  const [isRestored, setIsRestored] = useState(false);
  const [currentRun, setCurrentRun] = useState(null);
  const [currentParticipant, setCurrentParticipant] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [participants, setParticipants] = useState([]);
  const runId = currentRun?.id || null;
  const participantId = currentParticipant?.id || null;
  const participantIdRef = useRef(null);

  useEffect(() => {
    participantIdRef.current = currentParticipant?.id || null;
  }, [currentParticipant]);

  /** Laddar en run med frågor och deltagare till minnet. */
  const loadRunState = useCallback(async (run) => {
    if (!run) return;
    setCurrentRun(run);
    setQuestions(mapRunQuestions(run));
    try {
      const list = await runRepository.listParticipants(run.id);
      setParticipants(list);
      const trackedId = participantIdRef.current;
      if (trackedId) {
        const updated = list.find((entry) => entry.id === trackedId);
        if (updated) {
          setCurrentParticipant(updated);
        }
      }
    } catch (error) {
      console.warn('Kunde inte ladda deltagare för run', error);
    }
  }, []);

  /** Skapar en administratörsstyrd runda och gör den aktiv i contexten. */
  const createHostedRun = useCallback(async (input, creator) => {
    const run = await runRepository.createRun(input, creator);
    await loadRunState(run);
    return run;
  }, [loadRunState]);

  /** Genererar en runda on-demand och gör den aktiv i contexten. */
  const generateRun = useCallback(async (options, creator) => {
    const run = await runRepository.generateRouteRun(options, creator);
    await loadRunState(run);
    return run;
  }, [loadRunState]);

  /** Hämtar en runda via id (t.ex. vid sidladdning). */
  const loadRunById = useCallback(async (id) => {
    const run = await runRepository.getRun(id);
    if (!run) {
      throw new Error('Runda hittades inte');
    }
    await loadRunState(run);
    return run;
  }, [loadRunState]);

  /** Ansluter en deltagare med join-kod och sparar kopplingen. */
  const joinRunByCode = useCallback(async (joinCode, participantData) => {
    const run = await runRepository.getRunByCode(joinCode);
    if (!run) {
      throw new Error('Ingen runda hittades med angiven kod');
    }
    const participant = await runRepository.registerParticipant(run.id, participantData);
    await loadRunState(run);
    setCurrentParticipant(participant);
    return { run, participant };
  }, [loadRunState]);

  /** Återansluter till en runda utifrån sparad run- och deltagar-id. */
  const attachToRun = useCallback(async (id, participant) => {
    const run = await runRepository.getRun(id);
    if (!run) {
      throw new Error('Runda hittades inte');
    }
    const participantData = participant ? await runRepository.getParticipant(id, participant) : null;
    await loadRunState(run);
    setCurrentParticipant(participantData);
    return { run, participant: participantData };
  }, [loadRunState]);

  /** Hämtar den senaste deltagarlistan och uppdaterar aktuell deltagare. */
  const refreshParticipants = useCallback(async () => {
    if (!runId) return [];
    const list = await runRepository.listParticipants(runId);
    setParticipants(list);
    const trackedId = participantIdRef.current;
    if (trackedId) {
      const updated = list.find((entry) => entry.id === trackedId);
      if (updated) {
        setCurrentParticipant(updated);
      }
    }
    return list;
  }, [runId]);

  /** Sparar ett svar och räknar om deltagarens status. */
  const submitAnswer = useCallback(async ({ questionId, answerIndex }) => {
    if (!currentRun || !currentParticipant) {
      throw new Error('Ingen aktiv runda eller deltagare.');
    }
    const question = questionService.getById(questionId);
    if (!question) {
      throw new Error('Frågan hittades inte.');
    }
    const correct = question.correctOption === answerIndex;
    const participant = await runRepository.recordAnswer(currentRun.id, currentParticipant.id, {
      questionId,
      answerIndex,
      correct
    });
    setCurrentParticipant(participant);
    await refreshParticipants();
    return { participant, correct };
  }, [currentRun, currentParticipant, refreshParticipants]);

  /** Markerar att deltagaren är klar och uppdaterar listorna. */
  const completeRunForParticipant = useCallback(async () => {
    if (!runId || !participantId) return;
    await runRepository.completeRun(runId, participantId);
    await refreshParticipants();
  }, [runId, participantId, refreshParticipants]);

  /** Stänger rundan så att nya svar inte längre tas emot. */
  const closeRun = useCallback(async () => {
    if (!runId) return;
    await runRepository.closeRun(runId);
    const updated = await runRepository.getRun(runId);
    if (updated) {
      setCurrentRun(updated);
      setQuestions(mapRunQuestions(updated));
    }
  }, [runId]);

  useEffect(() => {
    if (currentRun && currentParticipant) {
      writeActiveParticipant({ runId: currentRun.id, participantId: currentParticipant.id });
    } else if (isRestored) {
      writeActiveParticipant(null);
    }
  }, [currentRun, currentParticipant, isRestored]);

  useEffect(() => {
    if (isRestored) return;
    const stored = readActiveParticipant();
    if (stored?.runId && stored?.participantId) {
      attachToRun(stored.runId, stored.participantId).catch((error) => {
        console.warn('Kunde inte återställa deltagare', error);
      });
    }
    setIsRestored(true);
  }, [isRestored, attachToRun]);

  useEffect(() => {
    if (!runId) return () => {};
    const unsubscribe = runRepository.subscribeRuns((runs) => {
      const updated = runs.find((run) => run.id === runId);
      if (updated) {
        setCurrentRun(updated);
        setQuestions(mapRunQuestions(updated));
      }
    });
    return unsubscribe;
  }, [runId]);

  useEffect(() => {
    if (!runId) return () => {};
    const unsubscribe = runRepository.subscribeParticipants(runId, (snapshot) => {
      setParticipants(snapshot);
      const trackedId = participantIdRef.current;
      if (trackedId) {
        const updated = snapshot.find((entry) => entry.id === trackedId);
        if (updated) {
          setCurrentParticipant(updated);
        }
      }
    });
    return unsubscribe;
  }, [runId]);

  useEffect(() => {
    if (!runId || !participantId) return undefined;
    if (typeof window === 'undefined') return undefined;

    const heartbeat = () => {
      runRepository.heartbeatParticipant(runId, participantId).catch((error) => {
        console.warn('Heartbeat misslyckades', error);
      });
    };

    heartbeat();
    const intervalId = window.setInterval(heartbeat, 15000);

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        heartbeat();
      }
    };

    const handleBeforeUnload = () => heartbeat();

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [runId, participantId]);

  useEffect(() => {
    refreshParticipants().catch((error) => {
      if (runId) {
        console.warn('Kunde inte uppdatera deltagare', error);
      }
    });
  }, [refreshParticipants, runId]);

  const value = useMemo(() => ({
    currentRun,
    questions,
    participants,
    currentParticipant,
    createHostedRun,
    generateRun,
    loadRunById,
    joinRunByCode,
    attachToRun,
    refreshParticipants,
    submitAnswer,
    completeRunForParticipant,
    closeRun
  }), [
    currentRun,
    questions,
    participants,
    currentParticipant,
    createHostedRun,
    generateRun,
    loadRunById,
    joinRunByCode,
    attachToRun,
    refreshParticipants,
    submitAnswer,
    completeRunForParticipant,
    closeRun
  ]);

  return (
    <RunContext.Provider value={value}>
      {children}
    </RunContext.Provider>
  );
};

export const useRun = () => {
  const context = useContext(RunContext);
  if (!context) {
    throw new Error('useRun måste användas inom RunProvider');
  }
  return context;
};
