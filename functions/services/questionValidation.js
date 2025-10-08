/**
 * Validerar en enskild fråga
 * @param {Object} question Frågan som ska valideras
 * @param {string} language Språk att validera (sv eller en)
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateQuestion(question, language = "sv") {
  const errors = [];

  let langData;
  if (question.languages) {
    langData = question.languages[language];
    if (!langData) {
      errors.push(`Frågan saknar ${language === "sv" ? "svensk" : "engelsk"} översättning`);
      return {valid: false, errors};
    }
  } else {
    langData = {
      text: question.text,
      options: question.options,
      explanation: question.explanation,
    };
  }

  const {text, options, explanation} = langData;
  const correctOption = question.correctOption;

  if (!text || text.trim().length < 10) {
    errors.push("Frågetexten måste vara minst 10 tecken lång");
  }

  if (!options || !Array.isArray(options)) {
    errors.push("Frågan måste ha svarsalternativ");
  } else if (options.length !== 4) {
    errors.push(`Frågan måste ha exakt 4 svarsalternativ (har ${options.length})`);
  } else {
    options.forEach((option, index) => {
      if (!option || option.trim().length === 0) {
        errors.push(`Alternativ ${index + 1} är tomt`);
      }
    });

    const uniqueOptions = new Set(options.map((option) => option.trim().toLowerCase()));
    if (uniqueOptions.size !== options.length) {
      errors.push("Flera svarsalternativ är identiska");
    }

    const similarOptions = findSimilarOptions(options);
    if (similarOptions.length > 0) {
      errors.push(`Varning: Dessa alternativ verkar liknande: ${similarOptions.join(", ")}`);
    }
  }

  if (typeof correctOption !== "number") {
    errors.push("Frågan måste ha ett korrekt svar angivet (correctOption)");
  } else if (correctOption < 0 || correctOption >= (options?.length || 0)) {
    errors.push(`Korrekt svar (${correctOption}) är utanför giltigt intervall (0-${(options?.length || 1) - 1})`);
  }

  if (!explanation || explanation.trim().length < 10) {
    errors.push("Förklaringen måste vara minst 10 tecken lång");
  }

  const validDifficulties = ["easy", "medium", "hard", "kid", "family", "adult"];
  if (!question.difficulty || !validDifficulties.includes(question.difficulty)) {
    errors.push(`Frågan måste ha en giltig svårighetsgrad (${validDifficulties.join("/")})`);
  }

  const validAudiences = ["barn", "vuxen", "familj", "kid", "family", "adult"];
  if (!question.audience && !validAudiences.includes(question.difficulty)) {
    if (!question.difficulty || !["kid", "family", "adult"].includes(question.difficulty)) {
      errors.push(`Frågan måste ha en giltig målgrupp (${validAudiences.join("/")})`);
    }
  }

  if (!question.category &&
    (!question.categories || !Array.isArray(question.categories) || question.categories.length === 0)) {
    errors.push("Frågan måste ha minst en kategori");
  }

  if (question.languages) {
    if (!question.languages.sv) {
      errors.push("Frågan saknar svensk översättning");
    }
    if (!question.languages.en) {
      errors.push("Frågan saknar engelsk översättning");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
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
 * Hittar potentiella dubletter i frågebanken
 * @param {Array} questions Lista med frågor
 * @param {string} language Språk att jämföra
 * @param {number} threshold Likhetströskel (0-1, default 0.85)
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
 * Validerar en batch av frågor
 * @param {Array} questions Lista med frågor
 * @param {string} language Språk att validera
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
