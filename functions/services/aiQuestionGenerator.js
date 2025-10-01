/**
 * AI-baserad frågegenerering med OpenAI
 * Genererar frågor på både svenska och engelska med kategorier och svårighetsgrader
 */
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const logger = require('firebase-functions/logger');

const CATEGORIES = ['geography', 'history', 'science', 'culture', 'sports', 'nature', 'technology'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * Genererar frågor med OpenAI
 * @param {Object} options - Genereringsalternativ
 * @param {number} options.amount - Antal frågor att generera (default: 10)
 * @param {string} options.category - Specifik kategori (valfri)
 * @param {string} options.difficulty - Svårighetsgrad (valfri)
 * @param {string} apiKey - OpenAI API-nyckel
 * @returns {Promise<Array>} Array med genererade frågor
 */
async function generateQuestions({ amount = 10, category = null, difficulty = null }, apiKey) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  const openai = new OpenAI({ apiKey });

  const categoryPrompt = category ? `All questions should be about ${category}.` : `Questions should cover various categories: ${CATEGORIES.join(', ')}.`;
  const difficultyPrompt = difficulty ? `All questions should be ${difficulty} difficulty.` : `Mix of easy, medium, and hard difficulty levels.`;

  const systemPrompt = `You are an expert quiz question generator. Generate ${amount} multiple-choice questions in both Swedish and English.

Requirements:
- Each question must have exactly 4 options (A, B, C, D)
- Only one correct answer
- Include a brief explanation for the correct answer
- ${categoryPrompt}
- ${difficultyPrompt}
- Questions should be interesting, educational, and suitable for all ages
- Avoid controversial or offensive topics
- Make questions clear and unambiguous

Return ONLY a valid JSON array with this exact structure:
[
  {
    "category": "geography",
    "difficulty": "easy",
    "correctOption": 0,
    "languages": {
      "sv": {
        "text": "Vilken är Sveriges huvudstad?",
        "options": ["Stockholm", "Göteborg", "Malmö", "Uppsala"],
        "explanation": "Stockholm är Sveriges huvudstad och största stad."
      },
      "en": {
        "text": "What is the capital of Sweden?",
        "options": ["Stockholm", "Gothenburg", "Malmö", "Uppsala"],
        "explanation": "Stockholm is the capital and largest city of Sweden."
      }
    }
  }
]

Important:
- correctOption is 0-indexed (0 = first option, 1 = second, etc.)
- Category must be one of: ${CATEGORIES.join(', ')}
- Difficulty must be one of: ${DIFFICULTIES.join(', ')}
- Return ONLY the JSON array, no other text`;

  try {
    logger.info('Generating questions with OpenAI', { amount, category, difficulty });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Använd gpt-4o-mini för kostnadseffektivitet
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate ${amount} quiz questions in both Swedish and English.` }
      ],
      temperature: 0.8, // Lite kreativitet men inte för mycket
      max_tokens: 4000,
      response_format: { type: 'json_object' } // Säkerställ JSON-svar
    });

    const content = response.choices[0].message.content;
    logger.info('Received response from OpenAI', { contentLength: content.length });

    // Parsa JSON-svar
    let questions;
    try {
      // Om OpenAI returnerar ett objekt med "questions" property
      const parsed = JSON.parse(content);
      questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
    } catch (parseError) {
      logger.error('Failed to parse OpenAI response', { content, error: parseError.message });
      throw new Error('Failed to parse AI response');
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('No questions generated');
    }

    // Validera och lägg till ID för varje fråga
    const validatedQuestions = questions
      .filter(q => validateQuestion(q))
      .map(q => ({
        id: uuidv4(),
        ...q,
        source: 'ai-generated',
        generatedAt: new Date().toISOString()
      }));

    logger.info('Successfully generated and validated questions', {
      requested: amount,
      generated: validatedQuestions.length
    });

    return validatedQuestions;

  } catch (error) {
    logger.error('Error generating questions with OpenAI', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Validerar en genererad fråga
 * @param {Object} question - Frågan att validera
 * @returns {boolean} True om frågan är giltig
 */
function validateQuestion(question) {
  // Kontrollera grundläggande struktur
  if (!question.category || !CATEGORIES.includes(question.category)) {
    logger.warn('Invalid category', { category: question.category });
    return false;
  }

  if (!question.difficulty || !DIFFICULTIES.includes(question.difficulty)) {
    logger.warn('Invalid difficulty', { difficulty: question.difficulty });
    return false;
  }

  if (typeof question.correctOption !== 'number' || question.correctOption < 0 || question.correctOption > 3) {
    logger.warn('Invalid correctOption', { correctOption: question.correctOption });
    return false;
  }

  // Kontrollera språk
  if (!question.languages || !question.languages.sv || !question.languages.en) {
    logger.warn('Missing languages');
    return false;
  }

  // Validera svenska
  const sv = question.languages.sv;
  if (!sv.text || !Array.isArray(sv.options) || sv.options.length !== 4 || !sv.explanation) {
    logger.warn('Invalid Swedish language data');
    return false;
  }

  // Validera engelska
  const en = question.languages.en;
  if (!en.text || !Array.isArray(en.options) || en.options.length !== 4 || !en.explanation) {
    logger.warn('Invalid English language data');
    return false;
  }

  return true;
}

/**
 * Genererar frågor för en specifik kategori och svårighetsgrad
 * @param {string} category - Kategori
 * @param {string} difficulty - Svårighetsgrad
 * @param {number} amount - Antal frågor
 * @param {string} apiKey - OpenAI API-nyckel
 * @returns {Promise<Array>} Array med frågor
 */
async function generateQuestionsForCategory(category, difficulty, amount, apiKey) {
  return generateQuestions({ amount, category, difficulty }, apiKey);
}

module.exports = {
  generateQuestions,
  generateQuestionsForCategory,
  CATEGORIES,
  DIFFICULTIES
};
