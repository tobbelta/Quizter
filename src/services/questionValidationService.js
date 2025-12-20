const LEGACY_DIFFICULTY_MAP = {
  easy: ['children'],
  medium: ['youth'],
  hard: ['adults'],
  kid: ['children'],
  family: ['children', 'adults'],
  adult: ['adults'],
};
const LEGACY_AUDIENCE_MAP = {
  barn: ['children'],
  kid: ['children'],
  children: ['children'],
  ungdom: ['youth'],
  youth: ['youth'],
  vuxen: ['adults'],
  adult: ['adults'],
  familj: ['children', 'adults'],
  family: ['children', 'adults'],
};
const MIN_TEXT_LENGTH = 10;
const REQUIRED_OPTION_COUNT = 4;

const normalizeLower = (value) => (typeof value === 'string' ? value.toLowerCase().trim() : '');

const resolveLanguageBlock = (question, language) => {
  if (question.languages) {
    return question.languages[language];
  }

  return {
    text: question.text,
    options: question.options,
    explanation: question.explanation,
  };
};

const resolveAgeGroups = (question, validAgeGroups = []) => {
  const shouldFilter = Array.isArray(validAgeGroups) && validAgeGroups.length > 0;
  const groups = new Set();

  if (Array.isArray(question.ageGroups)) {
    question.ageGroups.forEach((value) => {
      const normalized = normalizeLower(value);
      if (!normalized) return;
      if (!shouldFilter || validAgeGroups.includes(normalized)) {
        groups.add(normalized);
      }
    });
  }

  const difficulty = normalizeLower(question.difficulty);
  if (LEGACY_DIFFICULTY_MAP[difficulty]) {
    LEGACY_DIFFICULTY_MAP[difficulty].forEach((value) => groups.add(value));
  }

  const audience = normalizeLower(question.audience);
  if (LEGACY_AUDIENCE_MAP[audience]) {
    LEGACY_AUDIENCE_MAP[audience].forEach((value) => groups.add(value));
  }

  return Array.from(groups);
};

const resolveTargetAudience = (question) => {
  const directValue = normalizeLower(question.targetAudience);
  if (directValue) {
    return directValue;
  }

  // Legacy audience fanns tidigare och kan tolkas som svenskt fokus
  const legacyAudience = normalizeLower(question.audience);
  if (legacyAudience) {
    return legacyAudience;
  }

  return '';
};

const resolveCategories = (question) => {
  if (Array.isArray(question.categories)) {
    return question.categories
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  if (typeof question.category === 'string' && question.category.trim().length > 0) {
    return [question.category.trim()];
  }

  return [];
};

/**
 * Validerar en enskild fråga
 * @param {Object} question - Frågan som ska valideras
 * @param {string} language - Språk att validera (sv eller en)
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export const validateQuestion = (question, language = 'sv', options = {}) => {
  const errors = [];
  const validAgeGroups = Array.isArray(options.validAgeGroups) && options.validAgeGroups.length > 0
    ? options.validAgeGroups.map((value) => normalizeLower(value))
    : [];
  const validTargetAudiences = Array.isArray(options.validTargetAudiences) && options.validTargetAudiences.length > 0
    ? options.validTargetAudiences.map((value) => normalizeLower(value))
    : [];

  const langData = resolveLanguageBlock(question, language);
  if (!langData) {
    errors.push(`Frågan saknar ${language === 'sv' ? 'svensk' : 'engelsk'} översättning`);
    return { valid: false, errors };
  }

  const { text, options: answerOptions, explanation } = langData;
  const correctOption = question.correctOption;

  if (!text || text.trim().length < MIN_TEXT_LENGTH) {
    errors.push('Frågetexten måste vara minst 10 tecken lång');
  }

  if (!Array.isArray(answerOptions)) {
    errors.push('Frågan måste ha svarsalternativ');
  } else if (answerOptions.length !== REQUIRED_OPTION_COUNT) {
    errors.push(`Frågan måste ha exakt 4 svarsalternativ (har ${answerOptions.length})`);
  } else {
    answerOptions.forEach((option, index) => {
      if (!option || option.trim().length === 0) {
        errors.push(`Alternativ ${index + 1} är tomt`);
      }
    });

    const uniqueOptions = new Set(answerOptions.map((option) => option.trim().toLowerCase()));
    if (uniqueOptions.size !== answerOptions.length) {
      errors.push('Flera svarsalternativ är identiska');
    }

    const similarOptions = findSimilarOptions(answerOptions);
    if (similarOptions.length > 0) {
      errors.push(`Varning: Dessa alternativ verkar liknande: ${similarOptions.join(', ')}`);
    }
  }

  if (typeof correctOption !== 'number') {
    errors.push('Frågan måste ha ett korrekt svar angivet (correctOption)');
  } else if (correctOption < 0 || correctOption >= (answerOptions?.length || 0)) {
    errors.push(`Korrekt svar (${correctOption}) är utanför giltigt intervall (0-${(answerOptions?.length || 1) - 1})`);
  }

  if (!explanation || explanation.trim().length < MIN_TEXT_LENGTH) {
    errors.push('Förklaringen måste vara minst 10 tecken lång');
  }

  const ageGroups = resolveAgeGroups(question, validAgeGroups);
  if (ageGroups.length === 0) {
    errors.push('Frågan måste ha minst en ageGroup');
  }

  const targetAudience = resolveTargetAudience(question);
  if (!targetAudience) {
    errors.push('Frågan måste ha en targetAudience (t.ex. swedish/english/international)');
  } else if (validTargetAudiences.length > 0 && !validTargetAudiences.includes(targetAudience)) {
    errors.push(`Frågan måste ha en giltig targetAudience (${validTargetAudiences.join('/')})`);
  }

  const categories = resolveCategories(question);
  if (categories.length === 0) {
    errors.push('Frågan måste ha minst en kategori');
  }

  if (question.languages) {
    if (!question.languages.sv) {
      errors.push('Frågan saknar svensk översättning');
    }
    if (!question.languages.en) {
      errors.push('Frågan saknar engelsk översättning');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Hittar alternativ som är för lika varandra
 */
const findSimilarOptions = (options) => {
  const similar = [];

  for (let i = 0; i < options.length; i++) {
    for (let j = i + 1; j < options.length; j++) {
      const similarity = calculateSimilarity(options[i], options[j]);
      if (similarity > 0.8) { // 80% likhet
        similar.push(`"${options[i]}" ≈ "${options[j]}"`);
      }
    }
  }

  return similar;
};

/**
 * Beräknar likhet mellan två strängar (0-1)
 * Använder Levenshtein distance normaliserad
 */
const calculateSimilarity = (str1, str2) => {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);

  return 1 - (distance / maxLength);
};

/**
 * Levenshtein distance - antal ändringar för att göra str1 → str2
 */
const levenshteinDistance = (str1, str2) => {
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
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return dp[m][n];
};

/**
 * Hittar potentiella dubletter i frågebanken
 * @param {Array} questions - Lista med frågor
 * @param {string} language - Språk att jämföra
 * @param {number} threshold - Likhetströsk (0-1, default 0.85)
 * @returns {Array} Lista med dubbletter: [{ question1, question2, similarity }]
 */
export const findDuplicates = (questions, language = 'sv', threshold = 0.85) => {
  const duplicates = [];
  const seenPairs = new Set(); // Håll koll på par vi redan jämfört

  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      const q1 = questions[i];
      const q2 = questions[j];

      // Skapa unikt par-ID (sortera ID:n så ordningen inte spelar roll)
      const pairId = [q1.id, q2.id].sort().join('-');

      // Skippa om vi redan jämfört detta par
      if (seenPairs.has(pairId)) continue;
      seenPairs.add(pairId);

      const text1 = q1.languages?.[language]?.text || '';
      const text2 = q2.languages?.[language]?.text || '';

      if (!text1 || !text2) continue;

      const similarity = calculateSimilarity(text1, text2);

      if (similarity >= threshold) {
        duplicates.push({
          question1: q1,
          question2: q2,
          similarity: Math.round(similarity * 100),
          text1,
          text2,
          pairId // Lägg till för debugging
        });
      }
    }
  }

  // Sortera efter likhet, högsta först
  return duplicates.sort((a, b) => b.similarity - a.similarity);
};

/**
 * Validerar en batch av frågor
 * @param {Array} questions - Lista med frågor
 * @param {string} language - Språk att validera
 * @returns {Object} { valid: number, invalid: number, errors: Array }
 */
export const validateQuestions = (questions, language = 'sv', options = {}) => {
  const results = questions.map((question, index) => {
    const validation = validateQuestion(question, language, options);
    return {
      index,
      questionId: question.id,
      questionText: question.languages?.[language]?.text || 'Ingen text',
      ...validation
    };
  });

  const validCount = results.filter(r => r.valid).length;
  const invalidCount = results.filter(r => !r.valid).length;

  return {
    total: questions.length,
    valid: validCount,
    invalid: invalidCount,
    results: results.filter(r => !r.valid) // Visa bara ogiltiga
  };
};

const questionValidationService = {
  validateQuestion,
  validateQuestions,
  findDuplicates
};

export default questionValidationService;
