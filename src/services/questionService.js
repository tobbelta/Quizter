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

export const questionService = {
  /**
   * Returnerar hela frågebanken som används av runFactory.
   */
  listAll: () => cachedQuestions,

  /**
   * Hittar en fråga via id eller returnerar null om den saknas.
   */
  getById: (id) => cachedQuestions.find((question) => question.id === id) || null,

  /**
   * Returnerar flera frågor i samma ordning som id-listan.
   */
  getManyByIds: (ids) => ids.map((id) => cachedQuestions.find((question) => question.id === id)).filter(Boolean),

  /**
   * Hämtar nya frågor från OpenTDB baserat på målgrupp och lägger till dem i banken.
   */
  async fetchAndAddFromOpenTDB({ amount = 10, audience = 'family', difficulty = 'family' } = {}) {
    const fetched = await opentdbService.fetchQuestions({ amount, difficulty, audience });
    addQuestions(fetched);
    return fetched;
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
