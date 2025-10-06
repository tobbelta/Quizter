/**
 * Validering av frågor för att säkerställa kvalitet och undvika dubletter
 */

/**
 * Validerar en enskild fråga
 * @param {Object} question - Frågan som ska valideras
 * @param {string} language - Språk att validera (sv eller en)
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export const validateQuestion = (question, language = 'sv') => {
  const errors = [];

  // Hämta språkdata
  const langData = question.languages?.[language];

  if (!langData) {
    errors.push(`Frågan saknar ${language === 'sv' ? 'svensk' : 'engelsk'} översättning`);
    return { valid: false, errors };
  }

  const { text, options, explanation } = langData;
  const correctOption = question.correctOption;

  // 1. Kontrollera att frågetext finns och är tillräckligt lång
  if (!text || text.trim().length < 10) {
    errors.push('Frågetexten måste vara minst 10 tecken lång');
  }

  // 2. Kontrollera att det finns exakt 4 svarsalternativ
  if (!options || !Array.isArray(options)) {
    errors.push('Frågan måste ha svarsalternativ');
  } else if (options.length !== 4) {
    errors.push(`Frågan måste ha exakt 4 svarsalternativ (har ${options.length})`);
  } else {
    // 3. Kontrollera att alla alternativ har innehåll
    options.forEach((option, index) => {
      if (!option || option.trim().length === 0) {
        errors.push(`Alternativ ${index + 1} är tomt`);
      }
    });

    // 4. Kontrollera att inga alternativ är identiska
    const uniqueOptions = new Set(options.map(o => o.trim().toLowerCase()));
    if (uniqueOptions.size !== options.length) {
      errors.push('Flera svarsalternativ är identiska');
    }

    // 5. Kontrollera att flera alternativ inte kan vara rätt
    // Detta kräver semantisk analys - kan göras med AI senare
    const similarOptions = findSimilarOptions(options);
    if (similarOptions.length > 0) {
      errors.push(`Varning: Dessa alternativ verkar liknande: ${similarOptions.join(', ')}`);
    }
  }

  // 6. Kontrollera att correctOption är giltig
  if (typeof correctOption !== 'number') {
    errors.push('Frågan måste ha ett korrekt svar angivet (correctOption)');
  } else if (correctOption < 0 || correctOption >= (options?.length || 0)) {
    errors.push(`Korrekt svar (${correctOption}) är utanför giltigt intervall (0-${(options?.length || 1) - 1})`);
  }

  // 7. Kontrollera att förklaring finns
  if (!explanation || explanation.trim().length < 10) {
    errors.push('Förklaringen måste vara minst 10 tecken lång');
  }

  // 8. Kontrollera metadata
  if (!question.difficulty || !['easy', 'medium', 'hard'].includes(question.difficulty)) {
    errors.push('Frågan måste ha en giltig svårighetsgrad (easy/medium/hard)');
  }

  if (!question.audience || !['barn', 'vuxen', 'familj'].includes(question.audience)) {
    errors.push('Frågan måste ha en giltig målgrupp (barn/vuxen/familj)');
  }

  if (!question.categories || !Array.isArray(question.categories) || question.categories.length === 0) {
    errors.push('Frågan måste ha minst en kategori');
  }

  return {
    valid: errors.length === 0,
    errors
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
export const validateQuestions = (questions, language = 'sv') => {
  const results = questions.map((question, index) => {
    const validation = validateQuestion(question, language);
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
