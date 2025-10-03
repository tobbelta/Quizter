/**
 * Hanterar frågebanken, nu med Firestore-synkronisering.
 */
import { v4 as uuidv4 } from 'uuid';
import { QUESTION_BANK } from '../data/questions';
import { questionRepository } from '../repositories/questionRepository';

let cachedQuestions = []; // Använd bara Firestore-frågor
let isInitialized = false;

const listeners = new Set();

const notify = () => {
  listeners.forEach(listener => listener([...cachedQuestions]));
};

const initialize = async () => {
  if (isInitialized) return;
  try {
    const firestoreQuestions = await questionRepository.listQuestions(); // Use repository
    // Använd BARA frågor från Firestore (ta bort inbyggda frågor)
    // Sortera efter createdAt, nyaste först
    cachedQuestions = firestoreQuestions.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA; // Nyaste först
    });
    isInitialized = true;
    notify();
  } catch (error) {
    console.error("Kunde inte initialisera frågebanken från Firestore:", error);
    // Fallback till tom lista
    cachedQuestions = [];
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

    // Ladda om från Firestore för att få korrekta createdAt timestamps
    const firestoreQuestions = await questionRepository.listQuestions();
    cachedQuestions = firestoreQuestions.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA; // Nyaste först
    });

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
  addQuestions: async (questions) => await addQuestions(questions),
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
