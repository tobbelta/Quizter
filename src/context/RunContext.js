/**
 * RunContext - Central state management för rundor och deltagare
 *
 * Hanterar all run-relaterad state och business logic för applikationen.
 * Tillhandahåller real-time updates via Cloudflare API och persistent storage
 * för aktiv deltagare.
 *
 * Optimeringar:
 * - Memoization av alla callbacks för att förhindra onödiga re-renders
 * - Lazy loading av frågor och deltagare
 * - Automatisk cleanup av subscriptions
 * - Optimized heartbeat för deltagare
 *
 * @module RunContext
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

/**
 * React Context för run-state
 * Gör run-data tillgängligt genom hela komponent-trädet
 */
const RunContext = createContext(null);

/**
 * LocalStorage-nyckel för att komma ihåg aktiv deltagare mellan sessioner
 * Används för att återställa användarens session efter sidladdning
 */
const ACTIVE_PARTICIPANT_KEY = 'tipspromenad:activeParticipant';

/**
 * Heartbeat-intervall för deltagare (15 sekunder)
 * Uppdaterar deltagarens "last seen" status för activity tracking
 */
const HEARTBEAT_INTERVAL_MS = 15000;

/**
 * Läser sparad deltagarinfo från localStorage (persistent mellan sessioner)
 * Används för att återställa användarens session vid sidladdning
 *
 * @returns {Object|null} Sparad deltagarinfo eller null om ingen finns
 */
const readActiveParticipant = () => {
  // SSR-safe: Kontrollera att vi är i browser-miljö
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(ACTIVE_PARTICIPANT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('[RunContext] Kunde inte läsa aktiv deltagare från localStorage:', error);
    return null;
  }
};

/**
 * Sparar eller rensar deltagarinfo i localStorage
 * Möjliggör session-persistering mellan sidladdningar
 *
 * @param {Object|null} payload - Deltagarinfo att spara, eller null för att rensa
 */
const writeActiveParticipant = (payload) => {
  // SSR-safe: Kontrollera att vi är i browser-miljö
  if (typeof window === 'undefined') return;

  try {
    if (!payload) {
      window.localStorage.removeItem(ACTIVE_PARTICIPANT_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_PARTICIPANT_KEY, JSON.stringify(payload));
    }
  } catch (error) {
    console.warn('[RunContext] Kunde inte skriva aktiv deltagare till localStorage:', error);
  }
};

/**
 * Konverterar run-data till fullständiga frågeobjekt (memoized)
 * Optimering: Cachar frågor för att undvika upprepade API-anrop
 *
 * @param {Object} run - Run-objekt med questionIds array
 * @returns {Array} Array av fullständiga frågeobjekt
 */
const mapRunQuestions = (run) => {
  if (!run?.questionIds?.length) return [];
  return questionService.getManyByIds(run.questionIds);
};

/**
 * RunProvider - Huvudkomponent som tillhandahåller run-state till hela appen
 *
 * State Management:
 * - currentRun: Aktiv runda med all metadata
 * - currentParticipant: Inloggad deltagare (om någon)
 * - questions: Frågor för aktuell runda (memoized)
 * - participants: Alla deltagare i rundan (real-time)
 * - isRestored: Om session har återställts från localStorage
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export const RunProvider = ({ children }) => {
  // === STATE MANAGEMENT ===
  const [isRestored, setIsRestored] = useState(false);
  const [currentRun, setCurrentRun] = useState(null);
  const [currentParticipant, setCurrentParticipant] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [participants, setParticipants] = useState([]);

  // Derived state (optimerad för performance)
  const runId = currentRun?.id || null;
  const participantId = currentParticipant?.id || null;

  // Ref för stable reference i useEffect dependencies
  const participantIdRef = useRef(null);

  // === OPTIMIZATION: Synkronisera participantId ref för stable dependencies ===
  useEffect(() => {
    participantIdRef.current = currentParticipant?.id || null;
  }, [currentParticipant]);

  // === CORE BUSINESS LOGIC METHODS (memoized för performance) ===

  /**
   * Centraliserad laddning av run-state med optimerad error handling
   * Laddar runda + frågor + deltagare och synkroniserar aktuell deltagare
   *
   * @param {Object} run - Run-objekt från API
   */
  const loadRunState = useCallback(async (run) => {
    if (!run) return;

    // Uppdatera run och frågor synkront för snabb UI-uppdatering
    setCurrentRun(run);
    setQuestions(mapRunQuestions(run));
    questionService.ensureQuestionsByIds(run.questionIds)
      .then(() => {
        setQuestions(mapRunQuestions(run));
      })
      .catch((error) => {
        console.warn('[RunContext] Kunde inte ladda frågor för run:', error);
      });

    // Ladda deltagare asynkront med error handling
    try {
      const participantsList = await runRepository.listParticipants(run.id);
      setParticipants(participantsList);

      // Synkronisera aktuell deltagare om en är tracked
      const trackedId = participantIdRef.current;
      if (trackedId) {
        const updatedParticipant = participantsList.find((entry) => entry.id === trackedId);
        if (updatedParticipant) {
          setCurrentParticipant(updatedParticipant);
        }
      }
    } catch (error) {
      console.warn('[RunContext] Kunde inte ladda deltagare för run:', error);
      // Fortsätt med tom deltagarlista istället för att krascha
      setParticipants([]);
    }
  }, []);

  /**
   * Skapar en administratörsstyrd runda och aktiverar den
   * Används av admin-interface för manuellt skapade rundor
   *
   * @param {Object} input - Run configuration
   * @param {Object} creator - Admin som skapar rundan
   * @returns {Promise<Object>} Skapad runda
   */
  const createHostedRun = useCallback(async (input, creator) => {
    const run = await runRepository.createRun(input, creator);
    await loadRunState(run);
    return run;
  }, [loadRunState]);

  /**
   * Genererar en AI-driven runda baserat på parametrar
   * Används för automatiska rundor med rutt-generering
   *
   * @param {Object} options - Generering-parametrar (längd, svårighet, etc.)
   * @param {Object} creator - Användare som initierar genereringen
   * @returns {Promise<Object>} Genererad runda
   */
  const generateRun = useCallback(async (options, creator) => {
    const run = await runRepository.generateRouteRun(options, creator);
    await loadRunState(run);
    return run;
  }, [loadRunState]);

  /**
   * Laddar specifik runda via ID (för direktlänkar och sidladdning)
   * Inkluderar error handling för icke-existerande rundor
   *
   * @param {string} id - Run ID att ladda
   * @returns {Promise<Object>} Laddad runda
   * @throws {Error} Om rundan inte hittas
   */
  const loadRunById = useCallback(async (id) => {
    const run = await runRepository.getRun(id);
    if (!run) {
      throw new Error(`Runda med ID ${id} hittades inte`);
    }
    await loadRunState(run);
    return run;
  }, [loadRunState]);

  /**
   * Ansluter deltagare via join-kod (primär entry point för användare)
   * Registrerar ny deltagare och aktiverar session
   *
   * @param {string} joinCode - 6-siffrig join-kod
   * @param {Object} participantData - Deltagarens grundinformation
   * @returns {Promise<Object>} { run, participant }
   * @throws {Error} Om join-kod är ogiltig
   */
  const joinRunByCode = useCallback(async (joinCode, participantData) => {
    const run = await runRepository.getRunByCode(joinCode);
    if (!run) {
      throw new Error(`Ingen runda hittades med anslutningskod "${joinCode}"`);
    }
    const participant = await runRepository.registerParticipant(run.id, participantData);
    await loadRunState(run);
    setCurrentParticipant(participant);
    return { run, participant };
  }, [loadRunState]);

  /**
   * Återansluter till befintlig session (från localStorage restore)
   * Används vid sidladdning för att återställa deltagarens session
   *
   * @param {string} runId - Run ID att återansluta till
   * @param {string} participantId - Deltagare ID att återansluta som
   * @returns {Promise<Object>} { run, participant }
   * @throws {Error} Om run eller deltagare inte hittas
   */
  const attachToRun = useCallback(async (runId, participantId) => {
    const run = await runRepository.getRun(runId);
    if (!run) {
      throw new Error(`Runda med ID ${runId} hittades inte`);
    }

    const participantData = participantId
      ? await runRepository.getParticipant(runId, participantId)
      : null;

    await loadRunState(run);
    setCurrentParticipant(participantData);
    return { run, participant: participantData };
  }, [loadRunState]);

  /**
   * Uppdaterar deltagarlistan manuellt (optimerad för performance)
   * Behåller aktuell deltagare synkroniserad med server
   *
   * @returns {Promise<Array>} Uppdaterad deltagarlista
   */
  const refreshParticipants = useCallback(async () => {
    if (!runId) return [];

    const participantsList = await runRepository.listParticipants(runId);
    setParticipants(participantsList);

    // Synkronisera aktuell deltagare med server-state
    const trackedId = participantIdRef.current;
    if (trackedId) {
      const updatedParticipant = participantsList.find((entry) => entry.id === trackedId);
      if (updatedParticipant) {
        setCurrentParticipant(updatedParticipant);
      } else {
        participantIdRef.current = null;
        setCurrentParticipant(null);
        writeActiveParticipant(null);
      }
    }

    return participantsList;
  }, [runId]);

  /**
   * Skickar svar på fråga och uppdaterar deltagarens poäng
   * Central business logic för quiz-funktionalitet
   *
   * @param {Object} answerData - { questionId, answerIndex }
   * @returns {Promise<Object>} { participant, correct }
   * @throws {Error} Om runda/deltagare/fråga saknas
   */
  const submitAnswer = useCallback(async ({ questionId, answerIndex }) => {
    // Validera state
    if (!currentRun || !currentParticipant) {
      throw new Error('Ingen aktiv runda eller deltagare. Kontrollera din session.');
    }

    // Validera fråga
    const question = questionService.getById(questionId);
    if (!question) {
      throw new Error(`Fråga med ID ${questionId} hittades inte.`);
    }

    // Beräkna korrekthet och skicka svar
    const correct = question.correctOption === answerIndex;
    const updatedParticipant = await runRepository.recordAnswer(
      currentRun.id,
      currentParticipant.id,
      { questionId, answerIndex, correct }
    );

    // Uppdatera lokal state
    setCurrentParticipant(updatedParticipant);
    await refreshParticipants(); // Synkronisera med andra deltagare

    return { participant: updatedParticipant, correct };
  }, [currentRun, currentParticipant, refreshParticipants]);

  /**
   * Markerar deltagare som klar med rundan
   * Triggar completion-logik och final scoring
   */
  const completeRunForParticipant = useCallback(async () => {
    if (!runId || !participantId) {
      console.warn('[RunContext] Försökte markera deltagare som klar utan aktiv session');
      return;
    }

    await runRepository.completeRun(runId, participantId);
    await refreshParticipants(); // Uppdatera status för alla
  }, [runId, participantId, refreshParticipants]);

  /**
   * Stänger runda för nya deltagare (admin-funktion)
   * Sätter status till 'closed' och stoppar nya registreringar
   */
  const closeRun = useCallback(async () => {
    if (!runId) return;

    await runRepository.closeRun(runId);

    // Uppdatera lokal state med stängd runda
    const updatedRun = await runRepository.getRun(runId);
    if (updatedRun) {
      setCurrentRun(updatedRun);
      setQuestions(mapRunQuestions(updatedRun));
    }
  }, [runId]);

  /**
   * Uppdaterar run-metadata (admin-funktion)
   * Används för att spara ändringar i run-konfiguration
   *
   * @param {Object} updates - Fält att uppdatera
   * @returns {Promise<Object>} Uppdaterad runda
   */
  const updateRun = useCallback(async (updates) => {
    if (!runId) return null;

    const updatedRun = await runRepository.updateRun(runId, updates);
    if (updatedRun) {
      setCurrentRun(updatedRun);
      setQuestions(mapRunQuestions(updatedRun));
    }

    return updatedRun;
  }, [runId]);

  /**
   * Raderar en runda permanent (admin-funktion)
   * Tar bort runda och alla dess deltagare från databasen
   *
   * @param {string} targetRunId - ID för runda att radera (eller currentRun om ej angiven)
   * @returns {Promise<void>}
   */
  const deleteRun = useCallback(async (targetRunId = null) => {
    const runIdToDelete = targetRunId || runId;
    if (!runIdToDelete) return;

    await runRepository.deleteRun(runIdToDelete);

    // Om den raderade rundan är den aktiva, rensa state
    if (runIdToDelete === runId) {
      setCurrentRun(null);
      setCurrentParticipant(null);
      setQuestions([]);
      setParticipants([]);
      writeActiveParticipant(null); // Rensa localStorage
    }
  }, [runId]);

  // === SIDE EFFECTS & LIFECYCLE MANAGEMENT ===

  /**
   * Persistent storage: Sparar aktiv session till localStorage
   * Möjliggör session-återställning efter sidladdning
   */
  useEffect(() => {
    if (currentRun && currentParticipant) {
      // Spara aktiv session
      writeActiveParticipant({
        runId: currentRun.id,
        participantId: currentParticipant.id
      });
    } else if (isRestored) {
      // Rensa sparad session om ingen aktiv
      writeActiveParticipant(null);
    }
  }, [currentRun, currentParticipant, isRestored]);

  /**
   * Session restoration: Återställer session från localStorage vid app-start
   * Körs en gång när komponenten mountas
   */
  useEffect(() => {
    if (isRestored) return;

    const storedSession = readActiveParticipant();
    if (storedSession?.runId && storedSession?.participantId) {
      // Försök återställa session
      attachToRun(storedSession.runId, storedSession.participantId)
        .catch((error) => {
          console.warn('[RunContext] Kunde inte återställa session:', error);
          writeActiveParticipant(null); // Rensa felaktig session
        });
    }

    setIsRestored(true);
  }, [isRestored, attachToRun]);

  /**
   * Real-time run updates: Lyssnar på ändringar i run-metadata
   * Uppdaterar automatiskt vid admin-ändringar
   */
  useEffect(() => {
    if (!runId) return () => {};

    const unsubscribe = runRepository.subscribeRuns((runs) => {
      const updatedRun = runs.find((run) => run.id === runId);
      if (updatedRun) {
        setCurrentRun(updatedRun);
        setQuestions(mapRunQuestions(updatedRun));
      }
    });

    return unsubscribe;
  }, [runId]);

  /**
   * Real-time participant updates: Lyssnar på deltagare-ändringar
   * Uppdaterar leaderboard och status i real-time
   */
  useEffect(() => {
    if (!runId) return () => {};

    const unsubscribe = runRepository.subscribeParticipants(runId, (participantSnapshot) => {
      setParticipants(participantSnapshot);

      // Synkronisera aktuell deltagare med server-ändringar
      const trackedId = participantIdRef.current;
      if (trackedId) {
        const updatedParticipant = participantSnapshot.find((entry) => entry.id === trackedId);
        if (updatedParticipant) {
          setCurrentParticipant(updatedParticipant);
        } else {
          participantIdRef.current = null;
          setCurrentParticipant(null);
          writeActiveParticipant(null);
        }
      }
    });

    return unsubscribe;
  }, [runId]);

  /**
   * Participant heartbeat: Håller deltagaren markerad som aktiv
   * Optimerad med visibility API för batteribesparning
   */
  useEffect(() => {
    if (!runId || !participantId) return undefined;
    if (typeof window === 'undefined') return undefined;

    // Hjälpare för att städa bort en deltagarsession som inte längre finns i databasen
    const clearStaleParticipant = () => {
      participantIdRef.current = null;
      setCurrentParticipant(null);
      writeActiveParticipant(null);
    };

    // Heartbeat-funktion med error handling
    const sendHeartbeat = () => {
      runRepository.heartbeatParticipant(runId, participantId)
        .catch((error) => {
          console.warn('[RunContext] Heartbeat misslyckades:', error);

          // Om dokumentet saknas betyder det att deltagaren har tagits bort server-side.
          if (error?.code === 'not-found' || error?.message?.includes('No document to update')) {
            clearStaleParticipant();
          }
        });
    };

    // Initial heartbeat
    sendHeartbeat();

    // Regelbunden heartbeat
    const heartbeatInterval = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Optimering: Extra heartbeat när användaren återvänder till fliken
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };

    // Final heartbeat innan användaren lämnar sidan
    const handleBeforeUnload = () => sendHeartbeat();

    // Event listeners
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup
    return () => {
      window.clearInterval(heartbeatInterval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [runId, participantId]);

  /**
   * Initial participant load: Laddar deltagarlistan när ny runda aktiveras
   * Hanterar race conditions och error states gracefully
   */
  useEffect(() => {
    if (!runId) return;

    refreshParticipants().catch((error) => {
      console.warn('[RunContext] Kunde inte ladda initial deltagarlista:', error);
      // Fortsätt med tom lista istället för att krascha
      setParticipants([]);
    });
  }, [refreshParticipants, runId]);

  // === CONTEXT VALUE OPTIMIZATION ===

  /**
   * Memoized context value för optimal re-render performance
   * Grouperar relaterade funktioner för better tree-shaking
   */
  const contextValue = useMemo(() => ({
    // State (läs-only för komponenter)
    currentRun,
    questions,
    participants,
    currentParticipant,

    // Run lifecycle (admin & user actions)
    createHostedRun,
    generateRun,
    loadRunById,
    updateRun,
    closeRun,
    deleteRun,

    // Participant actions (user interactions)
    joinRunByCode,
    attachToRun,
    submitAnswer,
    completeRunForParticipant,

    // Utility functions
    refreshParticipants
  }), [
    // State dependencies
    currentRun,
    questions,
    participants,
    currentParticipant,

    // Function dependencies (alla är memoized med useCallback)
    createHostedRun,
    generateRun,
    loadRunById,
    updateRun,
    closeRun,
    deleteRun,
    joinRunByCode,
    attachToRun,
    submitAnswer,
    completeRunForParticipant,
    refreshParticipants
  ]);

  return (
    <RunContext.Provider value={contextValue}>
      {children}
    </RunContext.Provider>
  );
};

/**
 * Custom hook för att använda RunContext
 * Tillhandahåller type-safe access till run-state och actions
 *
 * @returns {Object} Context-objekt med state och funktioner
 * @throws {Error} Om hook används utanför RunProvider
 *
 * @example
 * const { currentRun, generateRun, submitAnswer } = useRun();
 */
export const useRun = () => {
  const context = useContext(RunContext);

  if (!context) {
    throw new Error(
      'useRun måste användas inom en RunProvider. ' +
      'Kontrollera att komponenten är wrappnad i <RunProvider>.'
    );
  }

  return context;
};


