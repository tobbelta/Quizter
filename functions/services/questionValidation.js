const VALID_AGE_GROUPS = ["children", "youth", "adults"];
const LEGACY_DIFFICULTY_MAP = {
  easy: ["children"],
  medium: ["youth"],
  hard: ["adults"],
  kid: ["children"],
  family: ["children", "adults"],
  adult: ["adults"],
};
const LEGACY_AUDIENCE_MAP = {
  barn: ["children"],
  kid: ["children"],
  children: ["children"],
  ungdom: ["youth"],
  youth: ["youth"],
  vuxen: ["adults"],
  adult: ["adults"],
  familj: ["children", "adults"],
  family: ["children", "adults"],
};
const VALID_TARGET_AUDIENCES = [
  "swedish",
  "english",
  "international",
  "global",
  "german",
  "norwegian",
  "danish",
];
const MIN_TEXT_LENGTH = 10;
const REQUIRED_OPTION_COUNT = 4;

/**
 * Validerar en enskild fraga
 * @param {Object} question Fragan som ska valideras
 * @param {string} language Sprak att validera (sv eller en)
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateQuestion(question, language = "sv") {
  const errors = [];

  const langData = resolveLanguageBlock(question, language);
  if (!langData) {
    errors.push(`Fragan saknar ${language === "sv" ? "svensk" : "engelsk"} oversattning`);
    return { valid: false, errors };
  }

  const { text, options, explanation } = langData;
  const correctOption = question.correctOption;

  if (!text || text.trim().length < MIN_TEXT_LENGTH) {
    errors.push("Fragetexten maste vara minst 10 tecken lang");
  }

  if (!Array.isArray(options)) {
    errors.push("Fragan maste ha svarsalternativ");
  } else if (options.length !== REQUIRED_OPTION_COUNT) {
    errors.push(`Fragan maste ha exakt 4 svarsalternativ (har ${options.length})`);
  } else {
    options.forEach((option, index) => {
      if (!option || option.trim().length === 0) {
        errors.push(`Alternativ ${index + 1} ar tomt`);
      }
    });

    const uniqueOptions = new Set(options.map((option) => option.trim().toLowerCase()));
    if (uniqueOptions.size !== options.length) {
      errors.push("Flera svarsalternativ ar identiska");
    }

    const similarOptions = findSimilarOptions(options);
    if (similarOptions.length > 0) {
      errors.push(`Varning: Dessa alternativ verkar liknande: ${similarOptions.join(", ")}`);
    }
  }

  if (typeof correctOption !== "number") {
    errors.push("Fragan maste ha ett korrekt svar angivet (correctOption)");
  } else if (correctOption < 0 || correctOption >= (options?.length || 0)) {
    errors.push(`Korrekt svar (${correctOption}) ar utanfor giltigt intervall (0-${(options?.length || 1) - 1})`);
  }

  if (!explanation || explanation.trim().length < MIN_TEXT_LENGTH) {
    errors.push("Forklaringen maste vara minst 10 tecken lang");
  }

  const ageGroups = resolveAgeGroups(question);
  if (ageGroups.length === 0) {
    errors.push("Fragan maste ha minst en ageGroup (children/youth/adults)");
  }

  const targetAudience = resolveTargetAudience(question);
  if (targetAudience && !VALID_TARGET_AUDIENCES.includes(targetAudience)) {
    errors.push(`Fragan maste ha en giltig targetAudience (${VALID_TARGET_AUDIENCES.join("/")})`);
  }

  const categories = resolveCategories(question);
  if (categories.length === 0) {
    errors.push("Fragan maste ha minst en kategori");
  }

  // Kräv minst ett språk, men inte båda
  if (question.languages) {
    const hasSv = question.languages.sv?.text && Array.isArray(question.languages.sv?.options) && question.languages.sv.options.length === 4;
    const hasEn = question.languages.en?.text && Array.isArray(question.languages.en?.options) && question.languages.en.options.length === 4;

    if (!hasSv && !hasEn) {
      errors.push("Fragan maste ha minst ett komplett sprak (svensk eller engelsk)");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function resolveLanguageBlock(question, language) {
  if (question.languages) {
    return question.languages[language];
  }

  return {
    text: question.text,
    options: question.options,
    explanation: question.explanation,
  };
}

function resolveAgeGroups(question) {
  const groups = new Set();

  if (Array.isArray(question.ageGroups)) {
    question.ageGroups.forEach((value) => {
      if (typeof value !== "string") return;
      const normalized = value.toLowerCase().trim();
      if (VALID_AGE_GROUPS.includes(normalized)) {
        groups.add(normalized);
      }
    });
  }

  const difficulty = typeof question.difficulty === "string"
    ? question.difficulty.toLowerCase().trim()
    : "";
  if (LEGACY_DIFFICULTY_MAP[difficulty]) {
    LEGACY_DIFFICULTY_MAP[difficulty].forEach((value) => groups.add(value));
  }

  const audience = typeof question.audience === "string"
    ? question.audience.toLowerCase().trim()
    : "";
  if (LEGACY_AUDIENCE_MAP[audience]) {
    LEGACY_AUDIENCE_MAP[audience].forEach((value) => groups.add(value));
  }

  return Array.from(groups);
}

function resolveTargetAudience(question) {
  if (typeof question.targetAudience === "string" && question.targetAudience.trim().length > 0) {
    return question.targetAudience.toLowerCase().trim();
  }

  if (typeof question.audience === "string" && question.audience.trim().length > 0) {
    return question.audience.toLowerCase().trim();
  }

  return "";
}

function resolveCategories(question) {
  if (Array.isArray(question.categories)) {
    return question.categories
      .filter((value) => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  if (typeof question.category === "string" && question.category.trim().length > 0) {
    return [question.category.trim()];
  }

  return [];
}

function findSimilarOptions(options) {
  const similar = [];

  for (let i = 0; i < options.length; i++) {
    for (let j = i + 1; j < options.length; j++) {
      const similarity = calculateSimilarity(options[i], options[j]);
      if (similarity > 0.8) {
        similar.push(`"${options[i]}" ~ "${options[j]}"`);
      }
    }
  }

  return similar;
}

function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);

  return 1 - (distance / maxLength);
}

function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1,
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Hittar potentiella dubletter i fragebanken
 * @param {Array} questions Lista med fragor
 * @param {string} language Sprak att jamfora
 * @param {number} threshold Likhetstraskel (0-1, default 0.85)
 * @returns {Array<{question1: Object, question2: Object, similarity: number}>}
 */
function findDuplicates(questions, language = "sv", threshold = 0.85) {
  const duplicates = [];
  const seenPairs = new Set();

  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      const q1 = questions[i];
      const q2 = questions[j];

      const pairId = [q1.id, q2.id].sort().join("-");
      if (seenPairs.has(pairId)) continue;
      seenPairs.add(pairId);

      const text1 = q1.languages?.[language]?.text || "";
      const text2 = q2.languages?.[language]?.text || "";

      if (!text1 || !text2) continue;

      const similarity = calculateSimilarity(text1, text2);

      if (similarity >= threshold) {
        duplicates.push({
          question1: q1,
          question2: q2,
          similarity: Math.round(similarity * 100),
          text1,
          text2,
          pairId,
        });
      }
    }
  }

  return duplicates.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Validerar en batch av fragor
 * @param {Array} questions Lista med fragor
 * @param {string} language Sprak att validera
 * @returns {{total: number, valid: number, invalid: number, results: Array}}
 */
function validateQuestions(questions, language = "sv") {
  const results = questions.map((question, index) => {
    const validation = validateQuestion(question, language);
    return {
      index,
      questionId: question.id,
      questionText: question.languages?.[language]?.text || "Ingen text",
      ...validation,
    };
  });

  const validCount = results.filter((entry) => entry.valid).length;
  const invalidCount = results.filter((entry) => !entry.valid).length;

  return {
    total: questions.length,
    valid: validCount,
    invalid: invalidCount,
    results: results.filter((entry) => !entry.valid),
  };
}

module.exports = {
  validateQuestion,
  validateQuestions,
  findDuplicates,
};
