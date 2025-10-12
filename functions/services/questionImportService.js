const {v4: uuidv4} = require("uuid");
const {validateQuestions, findDuplicates} = require("./questionValidation");

const DEFAULT_CATEGORY = 'Allmänt';
const DEFAULT_AGE_GROUP = 'adults';

function ensureLanguageStructure(question) {
  const normalized = question.languages
    ? { ...question }
    : {
        ...question,
        languages: {
          sv: {
            text: question.text,
            options: question.options,
            explanation: question.explanation || "",
          },
        },
      };

  const sv = normalized.languages?.sv || {};
  const en = normalized.languages?.en || {};

  normalized.languages = {
    sv: {
      text: sv.text || en.text || "",
      options: Array.isArray(sv.options) && sv.options.length === 4 ? sv.options : en.options || [],
      explanation: sv.explanation || en.explanation || "",
    },
    en: {
      text: en.text || sv.text || "",
      options: Array.isArray(en.options) && en.options.length === 4 ? en.options : sv.options || [],
      explanation: en.explanation || sv.explanation || "",
    },
  };

  // Normalisera kategorier
  let categories = [];
  if (Array.isArray(normalized.categories) && normalized.categories.length > 0) {
    categories = normalized.categories;
  } else if (typeof normalized.category === "string" && normalized.category.trim().length > 0) {
    categories = [normalized.category.trim()];
  }
  categories = categories
    .filter((cat) => typeof cat === "string" && cat.trim().length > 0)
    .map((cat) => cat.trim());
  if (categories.length === 0) {
    categories = [DEFAULT_CATEGORY];
  }

  // Normalisera ageGroups
  let ageGroups = [];
  if (Array.isArray(normalized.ageGroups) && normalized.ageGroups.length > 0) {
    ageGroups = normalized.ageGroups;
  } else {
    const audience = normalized.audience || normalized.difficulty;
    if (audience === "kid" || audience === "children") {
      ageGroups.push("children");
    }
    if (audience === "youth" || audience === "medium") {
      ageGroups.push("youth");
    }
    if (audience === "adult" || audience === "adults" || audience === "difficult") {
      ageGroups.push("adults");
    }
  }
  if (ageGroups.length === 0) {
    ageGroups = [DEFAULT_AGE_GROUP];
  }
  ageGroups = Array.from(new Set(ageGroups));

  // Normalisera targetAudience
  const targetAudience = normalized.targetAudience || "swedish";

  // Normalisera correctOption
  let correctOption = normalized.correctOption;
  if (typeof correctOption === "string") {
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
    correctOption,
  };
}

function mapInvalidResults(results) {
  return results.reduce((acc, result) => {
    if (result.questionId) {
      acc.set(result.questionId, result);
    }
    return acc;
  }, new Map());
}

/**
 * Förbereder frågor inför import till Firestore genom att:
 * 1. Säkerställa att varje fråga har ett ID
 * 2. Köra strukturvalidering och tagga med AI-status
 * 3. Ta bort dubletter mot befintliga frågor
 * @param {Array<Object>} rawQuestions Nya frågor som ska importeras
 * @param {Array<Object>} existingQuestions Befintliga frågor från databasen
 * @returns {{questionsToImport: Array<Object>, stats: {totalIncoming: number, duplicatesBlocked: number, invalidCount: number}}}
 */
async function loadExistingQuestions(db) {
  const snapshot = await db.collection("questions").get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return ensureLanguageStructure({
      id: doc.id,
      ...data,
    });
  });
}

function prepareQuestionsForImport(rawQuestions, existingQuestions) {
  const normalizedExisting = existingQuestions.map((question) => ensureLanguageStructure(question));

  const incomingWithIds = rawQuestions.map((question) => {
    const withId = question.id ? {...question} : {...question, id: uuidv4()};
    return ensureLanguageStructure(withId);
  });

  const validationResults = validateQuestions(incomingWithIds, "sv");
  const invalidById = mapInvalidResults(validationResults.results);
  const invalidIds = new Set(invalidById.keys());

  const allQuestions = [...normalizedExisting, ...incomingWithIds];
  const duplicates = findDuplicates(allQuestions, "sv", 0.85);

  const duplicateIds = new Set();
  duplicates.forEach((dup) => {
    if (incomingWithIds.some((question) => question.id === dup.question2.id)) {
      duplicateIds.add(dup.question2.id);
    }

    if (
      incomingWithIds.some((question) => question.id === dup.question1.id) &&
      normalizedExisting.some((question) => question.id === dup.question2.id)
    ) {
      duplicateIds.add(dup.question1.id);
    }
  });

  const questionsToImport = incomingWithIds
    .filter((question) => !duplicateIds.has(question.id))
    .map((question) => {
      const invalid = invalidById.get(question.id);
      if (invalid) {
        return {
          ...question,
          aiValidated: false,
          aiValidationResult: {
            valid: false,
            validationType: "structure",
            issues: invalid.errors || ["Strukturvalidering misslyckades"],
            reasoning: `Strukturvalidering: ${invalid.errors?.join(", ") || "Okänt fel"}`,
          },
        };
      }

      return {
        ...question,
        aiValidated: true,
        aiValidatedAt: new Date(),
        aiValidationResult: {
          valid: true,
          validationType: "structure",
          reasoning: "Strukturvalidering: Godkänd vid import",
          issues: [],
        },
      };
    });

  return {
    questionsToImport,
    stats: {
      totalIncoming: incomingWithIds.length,
      duplicatesBlocked: duplicateIds.size,
      invalidCount: invalidIds.size,
    },
  };
}

module.exports = {
  loadExistingQuestions,
  prepareQuestionsForImport,
};
