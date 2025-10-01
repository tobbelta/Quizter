/**
 * AI-baserad frågegenerering med Anthropic Claude
 * Genererar frågor på både svenska och engelska med kategorier och svårighetsgrader
 */
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const logger = require('firebase-functions/logger');

const CATEGORIES = ['geography', 'history', 'science', 'culture', 'sports', 'nature', 'technology'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * Genererar frågor med Anthropic Claude
 * @param {Object} options - Genereringsalternativ
 * @param {number} options.amount - Antal frågor att generera (default: 10)
 * @param {string} options.category - Specifik kategori (valfri)
 * @param {string} options.difficulty - Svårighetsgrad (valfri)
 * @param {string} apiKey - Anthropic API-nyckel
 * @returns {Promise<Array>} Array med genererade frågor
 */
async function generateQuestions({ amount = 10, category = null, difficulty = null }, apiKey) {
  if (!apiKey) {
    throw new Error('Anthropic API key is required');
  }

  const anthropic = new Anthropic({ apiKey });

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
{
  "questions": [
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
}

Important:
- correctOption is 0-indexed (0 = first option, 1 = second, etc.)
- Category must be one of: ${CATEGORIES.join(', ')}
- Difficulty must be one of: ${DIFFICULTIES.join(', ')}
- Return ONLY valid JSON, no markdown or other formatting`;

  try {
    logger.info('Generating questions with Anthropic Claude', { amount, category, difficulty });

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022', // Använd Haiku för snabbhet och låg kostnad
      max_tokens: 4096,
      temperature: 0.8,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Generate ${amount} quiz questions in both Swedish and English. Return only valid JSON.`
        }
      ]
    });

    const content = message.content[0].text;
    logger.info('Received response from Anthropic', { contentLength: content.length });

    // Parsa JSON-svar
    let questions;
    try {
      const parsed = JSON.parse(content);
      questions = parsed.questions || (Array.isArray(parsed) ? parsed : []);
    } catch (parseError) {
      logger.error('Failed to parse Anthropic response', { content, error: parseError.message });
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
        source: 'ai-generated-anthropic',
        generatedAt: new Date().toISOString()
      }));

    logger.info('Successfully generated and validated questions', {
      requested: amount,
      generated: validatedQuestions.length,
      model: 'claude-3-5-haiku-20241022'
    });

    return validatedQuestions;

  } catch (error) {
    logger.error('Error generating questions with Anthropic', {
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
 * @param {string} apiKey - Anthropic API-nyckel
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
