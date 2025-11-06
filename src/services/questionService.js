/**
 * QUESTION SERVICE
 * 
 * SYFTE: Central tjänst för att hantera frågebanken med Cloudflare API-synkronisering
 * 
 * FUNKTIONALITET:
 * - CRUD-operationer för frågor (skapa, läsa, uppdatera, radera)
 * - Lokal cache för snabb access (cachedQuestions + cachedQuestionMap)
 * - Listener-system för att notifiera components om ändringar
 * - AI-integration för generering och validering
 * - Validering av frågor (questionValidationService)
 * - Dubblettdetektering
 * - Sortering (nyaste först baserat på createdAt)
 * 
 * CACHE-STRATEGI:
 * - Laddar alla frågor vid första anropet (hydrateCache)
 * - Håller Map för snabb lookup via ID
 * - Uppdaterar cache vid varje operation
 * - Notifierar listeners vid ändringar
 * 
 * HUVUDFUNKTIONER:
 * - loadAllQuestions(): Hämta alla frågor (med cache)
 * - addQuestion(question): Lägg till ny fråga
 * - updateQuestion(id, updates): Uppdatera befintlig fråga
 * - deleteQuestion(id): Radera fråga
 * - subscribe(callback): Lyssna på ändringar
 * - generateQuestions(): Trigga AI-generering
 * - validateWithAI(): Validera fråga med AI
 * 
 * ANVÄNDNING:
 * - AdminQuestionsPage: CRUD-operations
 * - runFactory: Hämta frågor för run-skapande
 * - questionRepository: Abstraherar API-operations
 */
import { v4 as uuidv4 } from 'uuid';
import { QUESTION_BANK } from '../data/questions';
import { questionRepository } from '../repositories/questionRepository';
import { aiService } from './aiService';
import { validateQuestion, validateQuestions, findDuplicates } from './questionValidationService';

let cachedQuestions = []; // Lokal cache med frågor från API
let cachedQuestionMap = new Map();
let isInitialized = false;
let loadPromise = null;

const listeners = new Set();

const notify = () => {
  listeners.forEach(listener => listener([...cachedQuestions]));
};

const sortQuestions = (questions) => {
  return questions.sort((a, b) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return timeB - timeA; // Nyaste först
  });
};

const syncCacheFromMap = () => {
  cachedQuestions = sortQuestions(Array.from(cachedQuestionMap.values()));
};

const hydrateCache = async () => {
  try {
    const questions = await questionRepository.listQuestions();
    cachedQuestionMap = new Map(questions.map((question) => [question.id, question]));
    syncCacheFromMap();
    isInitialized = true;
    notify();
    return cachedQuestions;
  } catch (error) {
    console.error('[questionService] Kunde inte ladda frågor från API:', error);
    cachedQuestionMap = new Map();
    cachedQuestions = [];
    isInitialized = true;
    notify();
    throw error;
  }
};

const loadAllQuestions = async () => {
  await ensureCache();
  return cachedQuestions.map(normalizeQuestion);
};

const ensureCache = async () => {
  if (isInitialized) {
    return cachedQuestions;
  }

  if (!loadPromise) {
    loadPromise = hydrateCache().finally(() => {
      loadPromise = null;
    });
  }

  return loadPromise;
};

const reloadCache = async () => {
  loadPromise = hydrateCache().finally(() => {
    loadPromise = null;
  });
  return loadPromise;
};

const updateCachedQuestion = (questionId, updater) => {
  const existing = cachedQuestionMap.get(questionId);
  if (!existing) {
    return false;
  }

  const nextValue = typeof updater === 'function' ? updater(existing) : { ...existing, ...updater };
  cachedQuestionMap.set(questionId, nextValue);
  syncCacheFromMap();
  notify();
  return true;
};

const setStructureValidation = async (questionId, validationData) => {
  await ensureCache();
  try {
    const cleanValidationData = validationData
      ? JSON.parse(JSON.stringify(validationData))
      : null;

    const existing = cachedQuestionMap.get(questionId);
    const shouldClearLegacyAi =
      existing?.aiValidationResult?.validationType === 'structure';

    const updateData = {
      structureValidationResult: cleanValidationData,
      structureValidatedAt: new Date(),
    };

    if (shouldClearLegacyAi) {
      updateData.aiValidationResult = null;
    }

    await questionRepository.updateQuestion(questionId, updateData);

    updateCachedQuestion(questionId, (current) => ({
      ...current,
      ...updateData,
    }));

    return true;
  } catch (error) {
    console.error('[questionService] Kunde inte uppdatera strukturvalidering:', error);
    throw error;
  }
};

const removeCachedQuestions = (questionIds) => {
  const ids = Array.isArray(questionIds) ? new Set(questionIds) : new Set([questionIds]);
  let changed = false;
  ids.forEach((id) => {
    if (cachedQuestionMap.delete(id)) {
      changed = true;
    }
  });
  if (changed) {
    syncCacheFromMap();
    notify();
  }
};

const ensureQuestionsLoaded = async (questionIds = []) => {
  const ids = Array.isArray(questionIds) ? questionIds : [questionIds];
  const missing = ids.filter((id) => id && !cachedQuestionMap.has(id));
  if (missing.length === 0) {
    return;
  }

  try {
    const fetched = await questionRepository.getQuestionsByIds(missing);
    if (fetched.length > 0) {
      fetched.forEach((question) => {
        if (question) {
          cachedQuestionMap.set(question.id, question);
        }
      });
      syncCacheFromMap();
      notify();
    }
  } catch (error) {
    console.error('[questionService] Kunde inte ladda frågor efter id:', error);
  }
};

const addQuestions = async (questions) => {
  await ensureCache();

  const incoming = questions.filter(q => !cachedQuestions.some(existing => existing.id === q.id));
  if (incoming.length === 0) return { added: 0, duplicatesBlocked: 0, validationFailed: 0, total: 0 };

  // Säkerställ att varje inkommande fråga har ett ID innan validering/dublettkontroll
  const incomingWithIds = incoming.map(q => {
    if (q.id) {
      return { ...q };
    }
    return { ...q, id: uuidv4() };
  });

  try {
    // STEG 1: STRUKTURVALIDERING
    const validationResults = validateQuestions(incomingWithIds, 'sv');

    // Tagga strukturellt ogiltiga frågor (men importera dem ändå med feltagg)
    const structurallyInvalidIds = new Set();
    validationResults.results.forEach(result => {
      if (!result.valid) {
        structurallyInvalidIds.add(result.questionId);
      }
    });

    // STEG 2: DUBLETTKONTROLL
    const allQuestions = [...cachedQuestions, ...incomingWithIds];
    const duplicates = findDuplicates(allQuestions, 'sv', 0.85);

    const duplicateQuestionIds = new Set();
    duplicates.forEach(dup => {
      if (incomingWithIds.some(q => q.id === dup.question2.id)) {
        duplicateQuestionIds.add(dup.question2.id);
      }
      if (incomingWithIds.some(q => q.id === dup.question1.id) && cachedQuestions.some(q => q.id === dup.question2.id)) {
        duplicateQuestionIds.add(dup.question1.id);
      }
    });

    // FILTRERA: Ta bort BARA dubletter (behåll ogiltiga för att tagga dem)
    const uniqueIncoming = incomingWithIds.filter(q => !duplicateQuestionIds.has(q.id));

    if (duplicateQuestionIds.size > 0) {
      console.warn(`[questionService] Blockerar ${duplicateQuestionIds.size} dubletter vid import`);
    }

    if (uniqueIncoming.length === 0) {
      throw new Error(
        `Alla ${incoming.length} frågor är dubletter av befintliga frågor. ` +
        `Ingen ny fråga importerades.`
      );
    }

    // STEG 3: TAGGA ALLA FRÅGOR MED VALIDERINGSRESULTAT
    const questionsToImport = uniqueIncoming.map(q => {
      const validationResult = validationResults.results.find(r => r.questionId === q.id);

      if (structurallyInvalidIds.has(q.id)) {
        // Tagga som strukturellt ogiltig
        return {
          ...q,
          aiValidated: false,
          aiValidationResult: {
            valid: false,
            validationType: 'structure',
            issues: validationResult?.errors || ['Strukturvalidering misslyckades'],
            reasoning: 'Strukturvalidering: ' + (validationResult?.errors.join(', ') || 'Okänt fel')
          }
        };
      }

      // Strukturellt giltig fråga - markera som validerad
      return {
        ...q,
        aiValidated: true,
        aiValidatedAt: new Date(),
        aiValidationResult: {
          valid: true,
          validationType: 'structure',
          reasoning: 'Strukturvalidering: Godkänd vid import',
          issues: []
        }
      };
    });

    // STEG 4: IMPORTERA ALLA (även ogiltiga, så de syns i admin-gränssnittet)
    await questionRepository.addManyQuestions(questionsToImport);
    await reloadCache();

    const validCount = questionsToImport.filter(q => !structurallyInvalidIds.has(q.id)).length;
    const invalidCount = structurallyInvalidIds.size;

    return {
      added: validCount,
      addedInvalid: invalidCount,
      duplicatesBlocked: duplicateQuestionIds.size,
      total: incomingWithIds.length
    };
  } catch (error) {
    console.error("Kunde inte spara nya frågor till API:", error);
    throw error;
  }
};

const normalizeQuestion = (question) => {
  const normalized = question.languages
    ? { ...question }
    : {
        ...question,
        languages: {
          sv: {
            text: question.text,
            options: question.options,
            explanation: question.explanation || 'Ingen förklaring tillgänglig'
          }
        }
      };

  // Se till att både svenska och engelska finns
  const sv = normalized.languages?.sv || {
    text: '',
    options: []
  };
  const en = normalized.languages?.en || {
    text: sv.text,
    options: sv.options,
    explanation: sv.explanation
  };

  normalized.languages = {
    sv: {
      text: sv.text || en.text || '',
      options: Array.isArray(sv.options) && sv.options.length === 4 ? sv.options : en.options || [],
      explanation: sv.explanation || en.explanation || ''
    },
    en: {
      text: en.text || sv.text || '',
      options: Array.isArray(en.options) && en.options.length === 4 ? en.options : sv.options || [],
      explanation: en.explanation || sv.explanation || ''
    }
  };

  // Säkerställ att categories är en array
  let categories = [];
  if (Array.isArray(normalized.categories) && normalized.categories.length > 0) {
    categories = normalized.categories;
  } else if (normalized.category) {
    categories = [normalized.category];
  }
  categories = categories
    .filter((cat) => typeof cat === 'string' && cat.trim().length > 0)
    .map((cat) => cat.trim());
  if (categories.length === 0) {
    categories = ['Allmänt'];
  }

  // Säkerställ att ageGroups är en array
  let ageGroups = [];
  if (Array.isArray(normalized.ageGroups) && normalized.ageGroups.length > 0) {
    ageGroups = normalized.ageGroups;
  } else {
    const audience = normalized.audience || normalized.difficulty;
    if (audience === 'kid' || audience === 'children') {
      ageGroups.push('children');
    }
    if (audience === 'youth' || audience === 'medium') {
      ageGroups.push('youth');
    }
    if (audience === 'adult' || audience === 'adults' || audience === 'difficult') {
      ageGroups.push('adults');
    }
  }
  if (ageGroups.length === 0) {
    ageGroups = ['adults'];
  }
  ageGroups = Array.from(new Set(ageGroups));

  // Säkerställ targetAudience
  const targetAudience = normalized.targetAudience || 'swedish';

  // Normalisera correctOption till siffra
  let correctOption = normalized.correctOption;
  if (typeof correctOption === 'string') {
    const parsed = parseInt(correctOption, 10);
    if (!Number.isNaN(parsed)) {
      correctOption = parsed;
    }
  }

  return {
    ...normalized,
    categories,
    ageGroups,
    targetAudience,
    correctOption
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
  listAll: () => {
    if (!isInitialized && !loadPromise) {
      ensureCache().catch(() => {});
    }
    return cachedQuestions.map(normalizeQuestion);
  },
  loadAllQuestions: () => loadAllQuestions(),
  listAllForLanguage: (language = 'sv') => {
    if (!isInitialized && !loadPromise) {
      ensureCache().catch(() => {});
    }
    return cachedQuestions.map(q => getQuestionForLanguage(q, language));
  },
  getById: (id) => {
    if (!id) return null;
    const cached = cachedQuestionMap.get(id);
    if (!cached) {
      ensureQuestionsLoaded([id]);
      return null;
    }
    return normalizeQuestion(cached);
  },
  getByIdForLanguage: (id, language = 'sv') => {
    const cached = cachedQuestionMap.get(id);
    if (!cached) {
      ensureQuestionsLoaded([id]);
      return null;
    }
    return getQuestionForLanguage(cached, language);
  },
  getManyByIds: (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const missing = ids.filter((id) => id && !cachedQuestionMap.has(id));
    if (missing.length > 0) {
      ensureQuestionsLoaded(missing);
    }
    return ids
      .map((id) => {
        const cached = cachedQuestionMap.get(id);
        return cached ? normalizeQuestion(cached) : null;
      })
      .filter(Boolean);
  },
  ensureQuestionsByIds: (ids) => ensureQuestionsLoaded(ids),
  getManyByIdsForLanguage: (ids, language = 'sv') => {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const missing = ids.filter((id) => id && !cachedQuestionMap.has(id));
    if (missing.length > 0) {
      ensureQuestionsLoaded(missing);
    }
    return ids
      .map((id) => {
        const cached = cachedQuestionMap.get(id);
        return cached ? getQuestionForLanguage(cached, language) : null;
      })
      .filter(Boolean);
  },
  addQuestions: async (questions) => await addQuestions(questions),
  delete: async (questionId) => {
    await ensureCache();

    const questionIndex = cachedQuestions.findIndex(q => q.id === questionId);
    if (questionIndex === -1) {
      throw new Error('Fråga hittades inte i cache.');
    }

    const isBaseQuestion = QUESTION_BANK.some(q => q.id === questionId);
    if (isBaseQuestion) {
      throw new Error('Kan inte ta bort inbyggda frågor.');
    }

    await questionRepository.deleteQuestion(questionId);
    removeCachedQuestions(questionId);
    return true;
  },
  subscribe: (listener) => {
    listeners.add(listener);
    if (isInitialized) {
      listener([...cachedQuestions]);
    } else {
      ensureCache()
        .then(() => listener([...cachedQuestions]))
        .catch(() => listener([]));
    }
    return () => listeners.delete(listener);
  },
  // Nya valideringsfunktioner
  validateQuestion: (question, language = 'sv') => validateQuestion(question, language),
  validateQuestions: (questions, language = 'sv') => validateQuestions(questions, language),
  findDuplicates: (language = 'sv', threshold = 0.85) => findDuplicates(cachedQuestions, language, threshold),

  // AI-validera en enskild fråga
  validateSingleQuestion: async (questionId) => {
    await ensureCache();
    try {
      const question = cachedQuestionMap.get(questionId);
      if (!question) {
        throw new Error(`Question ${questionId} not found`);
      }

      const response = await aiService.startAIValidation({
        questionId: questionId,
        provider: 'openai' // Default provider
      });

      // Update question in cache with validation result
      if (response.success && response.result) {
        updateCachedQuestion(questionId, (current) => {
          if (!current) return current;
          return {
            ...current,
            aiValidated: response.result.isValid,
            aiValidationResult: response.result,
            aiValidatedAt: new Date()
          };
        });
      }

      return response;
    } catch (error) {
      console.error('Error validating single question:', error);
      throw error;
    }
  },

  // Batch-validera flera frågor
  batchValidateQuestions: async (questionIds) => {
    await ensureCache();
    try {
      const questionsToValidate = questionIds
        .map(id => cachedQuestionMap.get(id))
        .filter(Boolean)
        .map(q => {
          const langData = q.languages?.sv || { 
            text: q.text, 
            options: q.options, 
            explanation: q.explanation 
          };
          return { 
            id: q.id, 
            question: langData.text, 
            options: langData.options, 
            correctOption: q.correctOption, 
            explanation: langData.explanation 
          };
        });

      const response = await aiService.startBatchAIValidation({ 
        questions: questionsToValidate 
      });
      
      return response;
    } catch (error) {
      console.error('Error batch validating questions:', error);
      throw error;
    }
  },

  // Markera fråga som AI-validerad
  markAsValidated: async (questionId, validationData, skipNotify = false) => {
    await ensureCache();
    try {
  // Rensa undefined-värden från validationData (API tillåter inte undefined)
      const cleanValidationData = JSON.parse(JSON.stringify(validationData));

      await questionRepository.updateQuestion(questionId, {
        aiValidated: true,
        aiValidatedAt: new Date(),
        aiValidationResult: cleanValidationData
      });

      updateCachedQuestion(questionId, (current) => ({
        ...current,
        aiValidated: true,
        aiValidatedAt: new Date(),
        aiValidationResult: cleanValidationData
      }));
      return true;
    } catch (error) {
      console.error('Kunde inte markera fråga som validerad:', error);
      throw error;
    }
  },

  updateStructureValidation: (questionId, validationData) => setStructureValidation(questionId, validationData),
  clearStructureValidation: (questionId) => setStructureValidation(questionId, null),

  // Avmarkera fråga som AI-validerad (när den underkänns)
  markAsInvalid: async (questionId, validationData, skipNotify = false) => {
    await ensureCache();
    try {
  // Rensa undefined-värden från validationData (API tillåter inte undefined)
      const cleanValidationData = validationData
        ? JSON.parse(JSON.stringify(validationData))
        : validationData;
      const isStructureValidation = cleanValidationData?.validationType === 'structure';

      if (isStructureValidation) {
        return setStructureValidation(questionId, cleanValidationData);
      }

      await questionRepository.updateQuestion(questionId, {
        aiValidated: false,
        aiValidationResult: cleanValidationData
      });

      updateCachedQuestion(questionId, (current) => ({
        ...current,
        aiValidated: false,
        aiValidationResult: cleanValidationData
      }));
      return true;
    } catch (error) {
      console.error('Kunde inte markera fråga som ovaliderad:', error);
      throw error;
    }
  },

  // Batch-validera flera frågor (optimerad för att minimera API-anrop)
  markManyAsValidated: async (validationUpdates) => {
    await ensureCache();
    try {
      // validationUpdates är en array av { questionId, validationData, valid: true/false }
      const apiUpdates = validationUpdates.map(update => ({
        questionId: update.questionId,
        updateData: {
          aiValidated: update.valid,
          ...(update.valid ? { aiValidatedAt: new Date() } : {}),
          aiValidationResult: JSON.parse(JSON.stringify(update.validationData))
        }
      }));

      await questionRepository.updateManyQuestions(apiUpdates);

      apiUpdates.forEach(({ questionId, updateData }) => {
        updateCachedQuestion(questionId, (current) => ({
          ...current,
          ...updateData
        }));
      });
      return true;
    } catch (error) {
      console.error('[questionService.markManyAsValidated] ❌ Fel:', error);
      throw error;
    }
  },

  // Manuellt godkänn en fråga (efter manuell granskning)
  markAsManuallyApproved: async (questionId) => {
    await ensureCache();
    try {
      await questionRepository.updateQuestion(questionId, {
        aiValidated: true,
        manuallyApproved: true,
        manuallyRejected: false,
        manuallyApprovedAt: new Date(),
        aiValidationResult: {
          valid: true,
          validationType: 'manual',
          reasoning: 'Manuellt godkänd efter granskning'
        },
        structureValidationResult: {
          valid: true,
          validationType: 'manual',
          reasoning: 'Manuellt godkänd efter granskning',
          issues: [],
          checkedAt: new Date()
        }
      });

      updateCachedQuestion(questionId, (current) => ({
        ...current,
        aiValidated: true,
        manuallyApproved: true,
        manuallyRejected: false,
        manuallyApprovedAt: new Date(),
        aiValidationResult: {
          valid: true,
          validationType: 'manual',
          reasoning: 'Manuellt godkänd efter granskning'
        },
        structureValidationResult: {
          valid: true,
          validationType: 'manual',
          reasoning: 'Manuellt godkänd efter granskning',
          issues: [],
          checkedAt: new Date()
        }
      }));
      return true;
    } catch (error) {
      console.error('Kunde inte markera fråga som manuellt godkänd:', error);
      throw error;
    }
  },

  // Manuellt underkänn en fråga (efter manuell granskning)
  markAsManuallyRejected: async (questionId, reason = '') => {
    await ensureCache();
    try {
      await questionRepository.updateQuestion(questionId, {
        aiValidated: false,
        manuallyRejected: true,
        manuallyApproved: false,
        manuallyRejectedAt: new Date(),
        aiValidationResult: {
          valid: false,
          validationType: 'manual',
          issues: [reason || 'Manuellt underkänd efter granskning'],
          reasoning: reason || 'Manuellt underkänd efter granskning'
        }
      });

      updateCachedQuestion(questionId, (current) => ({
        ...current,
        aiValidated: false,
        manuallyRejected: true,
        manuallyApproved: false,
        manuallyRejectedAt: new Date(),
        aiValidationResult: {
          valid: false,
          validationType: 'manual',
          issues: [reason || 'Manuellt underkänd efter granskning'],
          reasoning: reason || 'Manuellt underkänd efter granskning'
        }
      }));
      return true;
    } catch (error) {
      console.error('Kunde inte markera fråga som manuellt underkänd:', error);
      throw error;
    }
  },

  // Rapportera en fråga (sätter den i karantän)
  reportQuestion: async (questionId, reason, reportedBy = 'anonymous') => {
    await ensureCache();
    try {
      const question = cachedQuestions.find(q => q.id === questionId);
      if (!question) {
        throw new Error('Frågan hittades inte');
      }

      // Skapa rapportobjekt
      const report = {
        reportedAt: new Date(),
        reportedBy,
        reason,
        resolved: false
      };

      // Hämta befintliga rapporter eller skapa ny array
      const existingReports = question.reports || [];
      const updatedReports = [...existingReports, report];

      await questionRepository.updateQuestion(questionId, {
        reported: true,
        reportCount: updatedReports.length,
        reports: updatedReports
      });

      updateCachedQuestion(questionId, (current) => ({
        ...current,
        reported: true,
        reportCount: updatedReports.length,
        reports: updatedReports
      }));
      return true;
    } catch (error) {
      console.error('Kunde inte rapportera fråga:', error);
      throw error;
    }
  },

  // Godkänn rapporterad fråga (tar bort från karantän)
  approveReportedQuestion: async (questionId) => {
    await ensureCache();
    try {
      const question = cachedQuestions.find(q => q.id === questionId);
      if (!question) {
        throw new Error('Frågan hittades inte');
      }

      // Markera alla rapporter som resolved
      const resolvedReports = (question.reports || []).map(report => ({
        ...report,
        resolved: true,
        resolvedAt: new Date(),
        resolution: 'approved'
      }));

      await questionRepository.updateQuestion(questionId, {
        reported: false,
        reports: resolvedReports,
        reportResolvedAt: new Date()
      });

      updateCachedQuestion(questionId, (current) => ({
        ...current,
        reported: false,
        reports: resolvedReports,
        reportResolvedAt: new Date()
      }));
      return true;
    } catch (error) {
      console.error('Kunde inte godkänna rapporterad fråga:', error);
      throw error;
    }
  },

  // Underkänn rapporterad fråga (markerar som manuellt underkänd)
  regenerateEmoji: async (questionId, preferredProvider) => {
    if (!questionId) {
      throw new Error('questionId is required');
    }

    await ensureCache();

    try {
      const response = await aiService.regenerateQuestionEmoji({ questionId, provider: preferredProvider });
      
      if (response.success && response.emoji) {
        const updateData = {
          emoji: response.emoji,
          emojiProvider: response.provider,
          emojiGeneratedAt: new Date(),
        };

        await questionRepository.updateQuestion(questionId, updateData);

        updateCachedQuestion(questionId, (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            ...updateData
          };
        });

        return response.emoji;
      } else {
        throw new Error('Failed to regenerate emoji');
      }
    } catch (error) {
      console.error('[questionService] Kunde inte regenerera emoji:', error);
      throw error;
    }
  },

  rejectReportedQuestion: async (questionId) => {
    await ensureCache();
    try {
      const question = cachedQuestions.find(q => q.id === questionId);
      if (!question) {
        throw new Error('Frågan hittades inte');
      }

      // Samla alla rapportanledningar
      const reportReasons = (question.reports || [])
        .map(r => r.reason)
        .filter(Boolean)
        .join('; ');

      // Markera alla rapporter som resolved
      const resolvedReports = (question.reports || []).map(report => ({
        ...report,
        resolved: true,
        resolvedAt: new Date(),
        resolution: 'rejected'
      }));

      await questionRepository.updateQuestion(questionId, {
        reported: false,
        aiValidated: false,
        manuallyRejected: true,
        manuallyApproved: false,
        manuallyRejectedAt: new Date(),
        reports: resolvedReports,
        reportResolvedAt: new Date(),
        aiValidationResult: {
          valid: false,
          validationType: 'manual',
          issues: [`Rapporterad av användare: ${reportReasons}`],
          reasoning: `Underkänd baserat på användarrapporter: ${reportReasons}`
        }
      });

      updateCachedQuestion(questionId, (current) => ({
        ...current,
        reported: false,
        aiValidated: false,
        manuallyRejected: true,
        manuallyApproved: false,
        manuallyRejectedAt: new Date(),
        reports: resolvedReports,
        reportResolvedAt: new Date(),
        aiValidationResult: {
          valid: false,
          validationType: 'manual',
          issues: [`Rapporterad av användare: ${reportReasons}`],
          reasoning: `Underkänd baserat på användarrapporter: ${reportReasons}`
        }
      }));
      return true;
    } catch (error) {
      console.error('Kunde inte underkänna rapporterad fråga:', error);
      throw error;
    }
  }
};
