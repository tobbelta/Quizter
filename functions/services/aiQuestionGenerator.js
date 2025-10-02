/**
 * AI-baserad frågegenerering med Anthropic Claude
 * Genererar frågor på både svenska och engelska med kategorier och svårighetsgrader
 */
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const logger = require('firebase-functions/logger');

// Svenska kategorier
const CATEGORIES = ['Geografi', 'Historia', 'Naturvetenskap', 'Kultur', 'Sport', 'Natur', 'Teknik', 'Djur', 'Gåtor'];

// Svårighetsgrader: barn, familj, vuxen
const DIFFICULTIES = ['kid', 'family', 'adult'];

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

  // Översätt svårighetsgrad till läsbart format
  const difficultyMapping = {
    'kid': 'barn (lämplig för barn 6-12 år, enkla frågor)',
    'family': 'familj (lämplig för alla åldrar, medel svårighet)',
    'adult': 'vuxen (utmanande frågor för vuxna)'
  };

  const categoryPrompt = category ? `Alla frågor ska handla om kategorin "${category}".` : `Frågorna ska täcka olika kategorier: ${CATEGORIES.join(', ')}.`;
  const difficultyPrompt = difficulty ? `Alla frågor ska vara på nivå: ${difficultyMapping[difficulty] || difficulty}` : `Blanda olika svårighetsgrader: barn (kid), familj (family), vuxen (adult).`;

  const systemPrompt = `Du är en expert på att skapa quizfrågor. Generera ${amount} flervalsfrågor på både svenska och engelska.

Krav:
- Varje fråga ska ha exakt 4 svarsalternativ (A, B, C, D)
- Endast ett korrekt svar
- Inkludera en kort förklaring till det korrekta svaret
- ${categoryPrompt}
- ${difficultyPrompt}
- Frågorna ska vara intressanta, pedagogiska och lämpliga för målgruppen
- Undvik kontroversiella eller stötande ämnen
- Gör frågorna tydliga och entydiga

Svara ENDAST med en giltig JSON-array med denna exakta struktur:
{
  "questions": [
    {
      "category": "Geografi",
      "difficulty": "family",
      "audience": "family",
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

Viktigt:
- correctOption är 0-indexerad (0 = första alternativet, 1 = andra, etc.)
- category måste vara en av: ${CATEGORIES.join(', ')}
- difficulty och audience måste vara en av: kid, family, adult
- Svara ENDAST med giltig JSON, ingen markdown eller annan formatering`;

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
        // Sätt audience till samma som difficulty om den saknas
        audience: q.audience || q.difficulty,
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
