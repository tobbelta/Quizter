/**
 * Hanterar frågebanken, nu med Firestore-synkronisering.
 */
import { v4 as uuidv4 } from 'uuid';
import { QUESTION_BANK } from '../data/questions';
import { questionRepository } from '../repositories/questionRepository';
import { validateQuestion, validateQuestions, findDuplicates } from './questionValidationService';

let cachedQuestions = []; // Använd bara Firestore-frågor
let isInitialized = false;

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

const initialize = async () => {
  if (isInitialized) return;

  try {
    // Starta real-time listener istället för one-time fetch
    questionRepository.subscribeToQuestions((questions) => {
      // Uppdatera cache automatiskt när Firestore ändras
      cachedQuestions = sortQuestions(questions);
      notify();

      if (!isInitialized) {
        console.log(`[questionService] Initialiserad med ${questions.length} frågor från Firestore (real-time sync aktiv)`);
        isInitialized = true;
      }
    });
  } catch (error) {
    console.error("Kunde inte initialisera frågebanken från Firestore:", error);
    // Fallback till tom lista
    cachedQuestions = [];
    isInitialized = true;
  }
};

// Initialisera direkt
initialize();

const addQuestions = async (questions) => {
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
    console.log('[questionService] Strukturvalidering av importerade frågor...');
    const validationResults = validateQuestions(incomingWithIds, 'sv');

    // Tagga strukturellt ogiltiga frågor (men importera dem ändå med feltagg)
    const structurallyInvalidIds = new Set();
    validationResults.results.forEach(result => {
      if (!result.valid) {
        structurallyInvalidIds.add(result.questionId);
      }
    });

    // STEG 2: DUBLETTKONTROLL
    console.log('[questionService] Dublettkontroll...');
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

    // Cache uppdateras automatiskt via Firestore real-time listener
    // Ingen manuell notify() behövs!

    const validCount = questionsToImport.filter(q => !structurallyInvalidIds.has(q.id)).length;
    const invalidCount = structurallyInvalidIds.size;

    console.log(`[questionService] Import klar: ${validCount} giltiga, ${invalidCount} ogiltiga, ${duplicateQuestionIds.size} dubletter blockerade`);

    return {
      added: validCount,
      addedInvalid: invalidCount,
      duplicatesBlocked: duplicateQuestionIds.size,
      total: incomingWithIds.length
    };
  } catch (error) {
    console.error("Kunde inte spara nya frågor till Firestore:", error);
    throw error;
  }
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

    await questionRepository.deleteQuestion(questionId);
    // Cache uppdateras automatiskt via Firestore real-time listener
    return true;
  },
  subscribe: (listener) => {
    listeners.add(listener);
    listener([...cachedQuestions]);
    return () => listeners.delete(listener);
  },
  // Nya valideringsfunktioner
  validateQuestion: (question, language = 'sv') => validateQuestion(question, language),
  validateQuestions: (questions, language = 'sv') => validateQuestions(questions, language),
  findDuplicates: (language = 'sv', threshold = 0.85) => findDuplicates(cachedQuestions, language, threshold),

  // Markera fråga som AI-validerad
  markAsValidated: async (questionId, validationData, skipNotify = false) => {
    try {
      // Rensa undefined-värden från validationData (Firestore tillåter inte undefined)
      const cleanValidationData = JSON.parse(JSON.stringify(validationData));

      await questionRepository.updateQuestion(questionId, {
        aiValidated: true,
        aiValidatedAt: new Date(),
        aiValidationResult: cleanValidationData
      });

      // Cache uppdateras automatiskt via Firestore real-time listener
      return true;
    } catch (error) {
      console.error('Kunde inte markera fråga som validerad:', error);
      throw error;
    }
  },

  // Avmarkera fråga som AI-validerad (när den underkänns)
  markAsInvalid: async (questionId, validationData, skipNotify = false) => {
    try {
      // Rensa undefined-värden från validationData (Firestore tillåter inte undefined)
      const cleanValidationData = JSON.parse(JSON.stringify(validationData));

      await questionRepository.updateQuestion(questionId, {
        aiValidated: false,
        aiValidationResult: cleanValidationData
      });

      // Cache uppdateras automatiskt via Firestore real-time listener
      return true;
    } catch (error) {
      console.error('Kunde inte markera fråga som ovaliderad:', error);
      throw error;
    }
  },

  // Batch-validera flera frågor (optimerad för att minimera Firestore-anrop)
  markManyAsValidated: async (validationUpdates) => {
    try {
      // validationUpdates är en array av { questionId, validationData, valid: true/false }
      await questionRepository.updateManyQuestions(validationUpdates.map(update => ({
        questionId: update.questionId,
        updateData: {
          aiValidated: update.valid,
          ...(update.valid ? { aiValidatedAt: new Date() } : {}),
          aiValidationResult: JSON.parse(JSON.stringify(update.validationData))
        }
      })));

      // Cache uppdateras automatiskt via Firestore real-time listener
      return true;
    } catch (error) {
      console.error('Kunde inte batch-validera frågor:', error);
      throw error;
    }
  },

  // Manuellt godkänn en fråga (efter manuell granskning)
  markAsManuallyApproved: async (questionId) => {
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
        }
      });

      // Cache uppdateras automatiskt via Firestore real-time listener
      return true;
    } catch (error) {
      console.error('Kunde inte markera fråga som manuellt godkänd:', error);
      throw error;
    }
  },

  // Manuellt underkänn en fråga (efter manuell granskning)
  markAsManuallyRejected: async (questionId, reason = '') => {
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

      // Cache uppdateras automatiskt via Firestore real-time listener
      return true;
    } catch (error) {
      console.error('Kunde inte markera fråga som manuellt underkänd:', error);
      throw error;
    }
  },

  // Rapportera en fråga (sätter den i karantän)
  reportQuestion: async (questionId, reason, reportedBy = 'anonymous') => {
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

      // Cache uppdateras automatiskt via Firestore real-time listener
      return true;
    } catch (error) {
      console.error('Kunde inte rapportera fråga:', error);
      throw error;
    }
  },

  // Godkänn rapporterad fråga (tar bort från karantän)
  approveReportedQuestion: async (questionId) => {
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

      // Cache uppdateras automatiskt via Firestore real-time listener
      return true;
    } catch (error) {
      console.error('Kunde inte godkänna rapporterad fråga:', error);
      throw error;
    }
  },

  // Underkänn rapporterad fråga (markerar som manuellt underkänd)
  rejectReportedQuestion: async (questionId) => {
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

      // Cache uppdateras automatiskt via Firestore real-time listener
      return true;
    } catch (error) {
      console.error('Kunde inte underkänna rapporterad fråga:', error);
      throw error;
    }
  }
};
