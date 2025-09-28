/**
 * Fabriksfunktioner som bygger run-objekt och deras checkpoints baserat på önskat scenario.
 */
import { v4 as uuidv4 } from 'uuid';
import { QUESTION_BANK } from '../data/questions';
import { questionService } from './questionService';

/**
 * Skapar en slumpad anslutningskod utan lättförväxlade tecken.
 */
const generateJoinCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

/**
 * Hämtar frågebanken från questionService och faller tillbaka till den bundlade listan.
 */
const resolveQuestionPool = () => {
  try {
    return questionService.listAll();
  } catch (error) {
    return QUESTION_BANK;
  }
};

/**
 * Filtrerar och väljer ut rätt antal frågor baserat på målgrupp och svårighet.
 */
const pickQuestions = ({ audience, difficulty, questionCount }) => {
  const pool = resolveQuestionPool();
  const filtered = pool.filter((question) => {
    if (audience === 'family') {
      return question.audience === 'family' || question.audience === 'kid';
    }
    if (audience === 'kid') {
      return question.audience === 'kid';
    }
    return question.audience === 'adult' || question.difficulty === difficulty;
  });

  const shuffled = [...filtered].sort(() => Math.random() - 0.5);
  if (shuffled.length < questionCount) {
    throw new Error('Frågebanken innehåller inte tillräckligt många frågor för vald profil.');
  }
  return shuffled.slice(0, questionCount);
};

/**
 * Skapar checkpoint-listan för en handplanerad runda. Placeringarna sprids runt startposition.
 */
const createHostedCheckpoints = (questions) => questions.map((question, index) => ({
  order: index + 1,
  location: {
    lat: 56.6616 + (Math.random() - 0.5) * 0.01,
    lng: 16.363 + (Math.random() - 0.5) * 0.01
  },
  questionId: question.id,
  title: `Fråga ${index + 1}`
}));

/**
 * Skapar en cirkulär rutt för auto-genererade rundor utifrån längd och startpunkt.
 */
const createGeneratedCheckpoints = (questions, { lengthMeters = 2500, origin }) => {
  return questions.map((question, index) => {
    const angle = (index / questions.length) * Math.PI * 2;
    const spread = lengthMeters / 1000 / questions.length;
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
};

/**
 * Fyller på metadata som skapats av admin så att run-objektet blir komplett.
 */
const stampBaseRun = (run, creator) => ({
  ...run,
  createdBy: creator?.id || 'admin',
  createdByName: creator?.name || 'Administratör',
  createdAt: new Date().toISOString(),
  status: 'active'
});

/**
 * Bygger en administratörsstyrd runda med fasta checkpoints.
 */
export const buildHostedRun = ({
  name,
  description,
  audience = 'family',
  difficulty = 'family',
  questionCount = 8,
  type = 'hosted',
  lengthMeters = 2000,
  allowAnonymous = true
}, creator) => {
  const questions = pickQuestions({ audience, difficulty, questionCount });
  const joinCode = generateJoinCode();
  const checkpoints = createHostedCheckpoints(questions);

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
    checkpoints,
    questionIds: questions.map((question) => question.id)
  };

  return stampBaseRun(run, creator);
};

/**
 * Bygger en auto-genererad runda inklusive slumpad joinCode och kartpunkter.
 */
export const buildGeneratedRun = ({
  alias,
  audience = 'family',
  difficulty = 'family',
  lengthMeters = 2500,
  questionCount = 8,
  allowAnonymous = true,
  origin
}, creator) => {
  const questions = pickQuestions({ audience, difficulty, questionCount });
  const joinCode = generateJoinCode();
  const checkpoints = createGeneratedCheckpoints(questions, { lengthMeters, origin });

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
    checkpoints,
    questionIds: questions.map((question) => question.id)
  };

  return stampBaseRun(run, creator || { id: alias || 'Auto', name: alias || 'Auto-generator' });
};
