import { v4 as uuidv4 } from 'uuid';
import { QUESTION_BANK } from '../data/questions';

const RUN_STORAGE_KEY = 'tipspromenad:runs';
const PARTICIPANT_STORAGE_KEY = 'tipspromenad:participants';

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

const writeJson = (key, value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Kunde inte skriva till localStorage', error);
  }
};

const getAllRuns = () => readJson(RUN_STORAGE_KEY, []);
const getAllParticipants = () => readJson(PARTICIPANT_STORAGE_KEY, []);

const persistRuns = (runs) => writeJson(RUN_STORAGE_KEY, runs);
const persistParticipants = (participants) => writeJson(PARTICIPANT_STORAGE_KEY, participants);

const generateJoinCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

const pickQuestions = ({ audience, difficulty, questionCount }) => {
  const filtered = QUESTION_BANK.filter((q) => {
    if (audience === 'family') {
      return q.audience === 'family' || q.audience === 'kid';
    }
    if (audience === 'kid') {
      return q.audience === 'kid';
    }
    return q.audience === 'adult' || q.difficulty === difficulty;
  });

  const shuffled = [...filtered].sort(() => Math.random() - 0.5);
  if (shuffled.length < questionCount) {
    throw new Error('Frågebanken innehåller inte tillräckligt många frågor för vald profil.');
  }
  return shuffled.slice(0, questionCount);
};

const createCheckpointsFromQuestions = (questions) => {
  return questions.map((question, index) => ({
    order: index + 1,
    location: {
      lat: 56.6616 + (Math.random() - 0.5) * 0.01,
      lng: 16.363 + (Math.random() - 0.5) * 0.01
    },
    questionId: question.id,
    title: `Fråga ${index + 1}`
  }));
};

export const runService = {
  listRuns: () => getAllRuns(),

  getRun: (runId) => getAllRuns().find((run) => run.id === runId) || null,

  getRunByCode: (joinCode) => getAllRuns().find((run) => run.joinCode === joinCode.toUpperCase()) || null,

  createRun: ({
    name,
    description,
    audience = 'family',
    difficulty = 'family',
    questionCount = 8,
    type = 'hosted',
    lengthMeters = 2000,
    allowAnonymous = true
  }, creator) => {
    const runs = getAllRuns();
    const joinCode = generateJoinCode();
    const questions = pickQuestions({ audience, difficulty, questionCount });
    const checkpoints = createCheckpointsFromQuestions(questions);

    const run = {
      id: uuidv4(),
      name,
      description,
      audience,
      difficulty,
      questionCount,
      type,
      lengthMeters,
      allowAnonymous,
      joinCode,
      qrSlug: joinCode.toLowerCase(),
      createdBy: creator?.id || 'admin',
      createdByName: creator?.name || 'Administratör',
      createdAt: new Date().toISOString(),
      status: 'active',
      checkpoints,
      questionIds: questions.map((q) => q.id)
    };

    persistRuns([...runs, run]);
    return run;
  },

  generateRouteRun: ({
    alias,
    audience = 'family',
    difficulty = 'family',
    lengthMeters = 2500,
    questionCount = 8,
    allowAnonymous = true,
    origin
  }) => {
    const runs = getAllRuns();
    const joinCode = generateJoinCode();
    const questions = pickQuestions({ audience, difficulty, questionCount });

    const checkpoints = questions.map((question, index) => {
      const angle = (index / questionCount) * Math.PI * 2;
      const spread = lengthMeters / 1000 / questionCount;
      const latOffset = Math.sin(angle) * spread * 0.01;
      const lngOffset = Math.cos(angle) * spread * 0.01;
      const baseLat = origin?.lat ?? 56.6616;
      const baseLng = origin?.lng ?? 16.363;
      return {
        order: index + 1,
        location: {
          lat: baseLat + latOffset,
          lng: baseLng + lngOffset
        },
        questionId: question.id,
        title: `Fråga ${index + 1}`
      };
    });

    const run = {
      id: uuidv4(),
      name: `Auto-runda av ${alias || 'okänd skapare'}`,
      description: 'Genererad utifrån önskemål',
      audience,
      difficulty,
      questionCount,
      type: 'generated',
      lengthMeters,
      allowAnonymous,
      joinCode,
      qrSlug: joinCode.toLowerCase(),
      createdBy: alias || 'Auto',
      createdByName: alias || 'Auto-generator',
      createdAt: new Date().toISOString(),
      status: 'active',
      checkpoints,
      questionIds: questions.map((q) => q.id)
    };

    persistRuns([...runs, run]);
    return run;
  },

  listParticipants: (runId) => getAllParticipants().filter((p) => p.runId === runId),

  registerParticipant: (runId, { userId, alias, contact, isAnonymous }) => {
    const participants = getAllParticipants();
    const run = runService.getRun(runId);
    if (!run) {
      throw new Error('Rundan hittades inte.');
    }

    if (!run.allowAnonymous && isAnonymous) {
      throw new Error('Anonyma deltagare är inte tillåtna för denna runda.');
    }

    const participant = {
      id: uuidv4(),
      runId,
      userId: userId || null,
      alias: alias || 'Gäst',
      contact: contact || null,
      isAnonymous: Boolean(isAnonymous),
      joinedAt: new Date().toISOString(),
      completedAt: null,
      currentOrder: 1,
      score: 0,
      answers: []
    };

    persistParticipants([...participants, participant]);
    return participant;
  },

  recordAnswer: (runId, participantId, { questionId, answerIndex, correct }) => {
    const participants = getAllParticipants();
    let updated = null;
    const nextList = participants.map((participant) => {
      if (participant.id !== participantId) {
        return participant;
      }

      const answers = [...participant.answers];
      const existingIndex = answers.findIndex((entry) => entry.questionId === questionId);
      const now = new Date().toISOString();
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
        completedAt: answers.length === runService.getRun(runId).questionIds.length ? now : participant.completedAt
      };
      return updated;
    });

    persistParticipants(nextList);
    return updated;
  },

  completeRun: (runId, participantId) => {
    const participants = getAllParticipants();
    const now = new Date().toISOString();
    const nextList = participants.map((participant) => {
      if (participant.id !== participantId) return participant;
      return {
        ...participant,
        completedAt: now
      };
    });
    persistParticipants(nextList);
  },

  closeRun: (runId) => {
    const runs = getAllRuns();
    const nextRuns = runs.map((run) => (run.id === runId ? { ...run, status: 'closed', closedAt: new Date().toISOString() } : run));
    persistRuns(nextRuns);
  }
};
