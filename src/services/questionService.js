import { QUESTION_BANK } from '../data/questions';
import { opentdbService } from './opentdbService';

const STORAGE_KEY = 'tipspromenad:questionBankExtra';

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

const notify = () => {
  listeners.forEach((listener) => {
    try {
      listener([...cachedQuestions]);
    } catch (error) {
      console.warn('Lyssnare kastade fel vid notify', error);
    }
  });
};

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
  listAll: () => cachedQuestions,

  getById: (id) => cachedQuestions.find((question) => question.id === id) || null,

  getManyByIds: (ids) => ids.map((id) => cachedQuestions.find((question) => question.id === id)).filter(Boolean),

  async fetchAndAddFromOpenTDB({ amount = 10, audience = 'family', difficulty = 'family' } = {}) {
    const fetched = await opentdbService.fetchQuestions({ amount, difficulty, audience });
    addQuestions(fetched);
    return fetched;
  },

  subscribe: (listener) => {
    listeners.add(listener);
    listener([...cachedQuestions]);
    return () => listeners.delete(listener);
  }
};
