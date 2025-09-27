import { QUESTION_BANK } from '../data/questions';

export const questionService = {
  listAll: () => QUESTION_BANK,

  getById: (id) => QUESTION_BANK.find((question) => question.id === id) || null,

  getManyByIds: (ids) => ids.map((id) => QUESTION_BANK.find((question) => question.id === id)).filter(Boolean)
};
