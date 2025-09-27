import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { runService } from '../services/runService';
import { questionService } from '../services/questionService';

const RunContext = createContext();

const ACTIVE_PARTICIPANT_KEY = 'tipspromenad:activeParticipant';

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

  const loadRunState = useCallback((run) => {
    if (!run) return;
    setCurrentRun(run);
    setQuestions(mapRunQuestions(run));
    setParticipants(runService.listParticipants(run.id));
  }, []);

  const createHostedRun = useCallback((input, creator) => {
    const run = runService.createRun(input, creator);
    loadRunState(run);
    return run;
  }, [loadRunState]);

  const generateRun = useCallback((options, creator) => {
    const run = runService.generateRouteRun(options, creator);
    loadRunState(run);
    return run;
  }, [loadRunState]);

  const loadRunById = useCallback((runId) => {
    const run = runService.getRun(runId);
    if (!run) {
      throw new Error('Runda hittades inte');
    }
    loadRunState(run);
    return run;
  }, [loadRunState]);

  const joinRunByCode = useCallback((joinCode, participantData) => {
    const run = runService.getRunByCode(joinCode);
    if (!run) {
      throw new Error('Ingen runda hittades med angiven kod');
    }
    const participant = runService.registerParticipant(run.id, participantData);
    loadRunState(run);
    setCurrentParticipant(participant);
    return { run, participant };
  }, [loadRunState]);

  const attachToRun = useCallback((runId, participantId) => {
    const run = runService.getRun(runId);
    if (!run) {
      throw new Error('Runda hittades inte');
    }
    const participant = runService.listParticipants(runId).find((entry) => entry.id === participantId) || null;
    loadRunState(run);
    setCurrentParticipant(participant);
    return { run, participant };
  }, [loadRunState]);

  const refreshParticipants = useCallback(() => {
    if (!currentRun) return [];
    const list = runService.listParticipants(currentRun.id);
    setParticipants(list);
    return list;
  }, [currentRun]);

  const submitAnswer = useCallback(({ questionId, answerIndex }) => {
    if (!currentRun || !currentParticipant) {
      throw new Error('Ingen aktiv runda eller deltagare.');
    }
    const question = questionService.getById(questionId);
    if (!question) {
      throw new Error('Frågan hittades inte.');
    }
    const correct = question.correctOption === answerIndex;
    const participant = runService.recordAnswer(currentRun.id, currentParticipant.id, {
      questionId,
      answerIndex,
      correct
    });
    setCurrentParticipant(participant);
    refreshParticipants();
    return { participant, correct };
  }, [currentRun, currentParticipant, refreshParticipants]);

  const completeRunForParticipant = useCallback(() => {
    if (!currentRun || !currentParticipant) return;
    runService.completeRun(currentRun.id, currentParticipant.id);
    refreshParticipants();
  }, [currentRun, currentParticipant, refreshParticipants]);

  const closeRun = useCallback(() => {
    if (!currentRun) return;
    runService.closeRun(currentRun.id);
    loadRunState(runService.getRun(currentRun.id));
  }, [currentRun, loadRunState]);

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
      try {
        attachToRun(stored.runId, stored.participantId);
      } catch (error) {
        console.warn('Kunde inte återställa deltagare', error);
      }
    }
    setIsRestored(true);
  }, [isRestored, attachToRun]);

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
