/**
 * Hanterar frågebanken, nu med Firestore-synkronisering.
 */
import { v4 as uuidv4 } from 'uuid';
import { QUESTION_BANK } from '../data/questions';
import { opentdbService } from './opentdbService';
import { questionRepository } from '../repositories/questionRepository';

let cachedQuestions = [...QUESTION_BANK];
let isInitialized = false;

const listeners = new Set();

const notify = () => {
  listeners.forEach(listener => listener([...cachedQuestions]));
};

const initialize = async () => {
  if (isInitialized) return;
  try {
    const firestoreQuestions = await questionRepository.listQuestions(); // Use repository
    // Kombinera och ta bort duplicerade frågor
    const allQuestions = [...QUESTION_BANK, ...firestoreQuestions];
    const uniqueQuestions = allQuestions.filter((q, index, self) => 
        index === self.findIndex((t) => t.id === q.id)
    );
    cachedQuestions = uniqueQuestions;
    isInitialized = true;
    notify();
  } catch (error) {
    console.error("Kunde inte initialisera frågebanken från Firestore:", error);
    // Fallback till bara inbyggda frågor
    cachedQuestions = [...QUESTION_BANK];
  }
};

// Initialisera direkt
initialize();

const addQuestions = async (questions) => {
  const incoming = questions.filter(q => !cachedQuestions.some(existing => existing.id === q.id));
  if (incoming.length === 0) return cachedQuestions;

  try {
    const questionsWithIds = incoming.map(q => ({ ...q, id: q.id || uuidv4() }));
    await questionRepository.addManyQuestions(questionsWithIds);
    cachedQuestions = [...cachedQuestions, ...incoming];
    notify();
  } catch (error) {
    console.error("Kunde inte spara nya frågor till Firestore:", error);
  }
  return cachedQuestions;
};

const normalizeQuestion = (question) => {
  if (question.languages) return question;
  return {
    ...question,
    languages: {
      sv: {
        text: question.text,
        options: question.options,
        explanation: question.explanation || 'Ingen förklaring tillgänglig'
      }
    }
  };
};

const getQuestionForLanguage = (question, language = 'sv') => {
  const normalized = normalizeQuestion(question);
  const langData = normalized.languages[language] || normalized.languages.sv || normalized.languages[Object.keys(normalized.languages)[0]];
  if (!langData) {
    return { ...normalized, text: 'Frågan kunde inte laddas', options: [], explanation: '' };
  }
  return { ...normalized, text: langData.text, options: langData.options, explanation: langData.explanation };
};

export const questionService = {
  listAll: () => cachedQuestions.map(normalizeQuestion),
  listAllForLanguage: (language = 'sv') => cachedQuestions.map(q => getQuestionForLanguage(q, language)),
  getById: (id) => {
    const question = cachedQuestions.find((q) => q.id === id);
    return question ? normalizeQuestion(question) : null;
  },
  getByIdForLanguage: (id, language = 'sv') => {
    const question = cachedQuestions.find((q) => q.id === id);
    return question ? getQuestionForLanguage(question, language) : null;
  },
  getManyByIds: (ids) => ids.map(id => questionService.getById(id)).filter(Boolean),
  getManyByIdsForLanguage: (ids, language = 'sv') => ids.map(id => questionService.getByIdForLanguage(id, language)).filter(Boolean),
  async fetchAndAddFromOpenTDB({ amount = 10, audience = 'family', difficulty = 'family' } = {}) {
    const fetched = await opentdbService.fetchQuestions({ amount, difficulty, audience });
    await addQuestions(fetched);
    return fetched;
  },
  delete: async (questionId) => {
    const questionIndex = cachedQuestions.findIndex(q => q.id === questionId);
    if (questionIndex === -1) {
      throw new Error('Fråga hittades inte i cache.');
    }

    const isBaseQuestion = QUESTION_BANK.some(q => q.id === questionId);
    if (isBaseQuestion) {
      throw new Error('Kan inte ta bort inbyggda frågor.');
    }

    await questionRepository.deleteQuestion(questionId); // Delete from Firestore
    cachedQuestions = cachedQuestions.filter(q => q.id !== questionId); // Update cache
    notify();
    return true;
  },
  subscribe: (listener) => {
    listeners.add(listener);
    listener([...cachedQuestions]);
    return () => listeners.delete(listener);
  }
};
