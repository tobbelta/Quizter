/**
 * Hanterar frågebanken lokalt och kan utökas med data från externa källor.
 */
import { QUESTION_BANK } from '../data/questions';
import { opentdbService } from './opentdbService';

const STORAGE_KEY = 'tipspromenad:questionBankExtra';

/**
 * Läser in extra frågor som användaren redan hämtat tidigare via localStorage.
 */
const readExtras = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('Kunde inte läsa extra frågor från storage', error);
    return [];
  }
};

/**
 * Sparar ned nya extra frågor i localStorage så att de finns offline nästa gång.
 */
const writeExtras = (extras) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(extras));
  } catch (error) {
    console.warn('Kunde inte spara extra frågor', error);
  }
};

let cachedQuestions = [...QUESTION_BANK];
let extraQuestions = [];

if (typeof window !== 'undefined') {
  extraQuestions = readExtras();
  cachedQuestions = [...QUESTION_BANK, ...extraQuestions];
}

const listeners = new Set();

/**
 * Meddelar alla prenumeranter att frågebanken har ändrats.
 */
const notify = () => {
  listeners.forEach((listener) => {
    try {
      listener([...cachedQuestions]);
    } catch (error) {
      console.warn('Lyssnare kastade fel vid notify', error);
    }
  });
};

/**
 * Lägger till nya frågor om de inte redan finns och triggar notifiering.
 */
const addQuestions = (questions) => {
  const incoming = questions.filter((question) => !cachedQuestions.some((existing) => existing.id === question.id));
  if (incoming.length === 0) {
    return cachedQuestions;
  }
  cachedQuestions = [...cachedQuestions, ...incoming];
  extraQuestions = [...extraQuestions, ...incoming.filter((question) => !QUESTION_BANK.some((base) => base.id === question.id))];
  writeExtras(extraQuestions);
  notify();
  return cachedQuestions;
};

/**
 * Konverterar gamla frågeformat till nya språkbaserade format.
 */
const normalizeQuestion = (question) => {
  // Om frågan redan har det nya formatet
  if (question.languages) {
    return question;
  }

  // Konvertera gammalt format till nytt
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

/**
 * Hämtar frågetext och alternativ för specifikt språk.
 */
const getQuestionForLanguage = (question, language = 'sv') => {
  const normalized = normalizeQuestion(question);
  const langData = normalized.languages[language] || normalized.languages.sv || normalized.languages[Object.keys(normalized.languages)[0]];

  return {
    ...normalized,
    text: langData.text,
    options: langData.options,
    explanation: langData.explanation
  };
};

export const questionService = {
  /**
   * Returnerar hela frågebanken som används av runFactory.
   */
  listAll: () => cachedQuestions.map(normalizeQuestion),

  /**
   * Returnerar hela frågebanken för ett specifikt språk.
   */
  listAllForLanguage: (language = 'sv') => cachedQuestions.map(q => getQuestionForLanguage(q, language)),

  /**
   * Hittar en fråga via id eller returnerar null om den saknas.
   */
  getById: (id) => {
    const question = cachedQuestions.find((q) => q.id === id);
    return question ? normalizeQuestion(question) : null;
  },

  /**
   * Hittar en fråga via id för specifikt språk.
   */
  getByIdForLanguage: (id, language = 'sv') => {
    const question = cachedQuestions.find((q) => q.id === id);
    return question ? getQuestionForLanguage(question, language) : null;
  },

  /**
   * Returnerar flera frågor i samma ordning som id-listan.
   */
  getManyByIds: (ids) => ids.map((id) => {
    const question = cachedQuestions.find((q) => q.id === id);
    return question ? normalizeQuestion(question) : null;
  }).filter(Boolean),

  /**
   * Returnerar flera frågor för specifikt språk.
   */
  getManyByIdsForLanguage: (ids, language = 'sv') => ids.map((id) => {
    const question = cachedQuestions.find((q) => q.id === id);
    return question ? getQuestionForLanguage(question, language) : null;
  }).filter(Boolean),

  /**
   * Hämtar nya frågor från OpenTDB baserat på målgrupp och lägger till dem i banken.
   */
  async fetchAndAddFromOpenTDB({ amount = 10, audience = 'family', difficulty = 'family' } = {}) {
    const fetched = await opentdbService.fetchQuestions({ amount, difficulty, audience });
    addQuestions(fetched);
    return fetched;
  },

  /**
   * Tar bort en fråga från banken (endast extra frågor, inte från QUESTION_BANK).
   */
  delete: (questionId) => {
    const questionIndex = cachedQuestions.findIndex(q => q.id === questionId);
    if (questionIndex === -1) {
      throw new Error('Fråga hittades inte');
    }


    // Kontrollera om det är en bas-fråga från QUESTION_BANK
    const isBaseQuestion = QUESTION_BANK.some(q => q.id === questionId);
    if (isBaseQuestion) {
      throw new Error('Kan inte ta bort inbyggda frågor');
    }

    // Ta bort från cachedQuestions
    cachedQuestions = cachedQuestions.filter(q => q.id !== questionId);

    // Ta bort från extraQuestions och uppdatera localStorage
    extraQuestions = extraQuestions.filter(q => q.id !== questionId);
    writeExtras(extraQuestions);

    notify();
    return true;
  },

  /**
   * Exponerar en prenumeration så att UI kan uppdatera sig vid ändringar.
   */
  subscribe: (listener) => {
    listeners.add(listener);
    listener([...cachedQuestions]);
    return () => listeners.delete(listener);
  }
};
