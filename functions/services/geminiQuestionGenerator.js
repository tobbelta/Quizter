/**
 * AI-baserad frågegenerering med Google Gemini
 * Används som tredje fallback om både Anthropic och OpenAI misslyckas
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');
const logger = require('firebase-functions/logger');

const CATEGORIES = ['Geografi', 'Historia', 'Naturvetenskap', 'Kultur', 'Sport', 'Natur', 'Teknik', 'Djur', 'Gåtor'];
const DIFFICULTIES = ['kid', 'family', 'adult'];

/**
 * Genererar frågor med Google Gemini
 */
async function generateQuestions({ amount = 10, category = null, difficulty = null }, apiKey) {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const difficultyMapping = {
    'kid': 'barn (lämplig för barn 6-12 år, enkla frågor)',
    'family': 'familj (lämplig för alla åldrar, medel svårighet)',
    'adult': 'vuxen (utmanande frågor för vuxna)'
  };

  const categoryPrompt = category ? `Alla frågor ska handla om kategorin "${category}".` : `Frågorna ska täcka olika kategorier: ${CATEGORIES.join(', ')}.`;
  const difficultyPrompt = difficulty ? `Alla frågor ska vara på nivå: ${difficultyMapping[difficulty] || difficulty}` : `Blanda olika svårighetsgrader: barn (kid), familj (family), vuxen (adult).`;

  const prompt = `Du är en expert på att skapa quizfrågor. Generera ${amount} flervalsfrågor på både svenska och engelska.

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
    logger.info('Generating questions with Gemini', { amount, category, difficulty });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let content = response.text();

    logger.info('Received response from Gemini', { contentLength: content.length });

    // Ta bort markdown-formatering om den finns
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Parsa JSON-svar
    let questions;
    try {
      const parsed = JSON.parse(content);
      questions = parsed.questions || (Array.isArray(parsed) ? parsed : []);
    } catch (parseError) {
      logger.error('Failed to parse Gemini response', { content: content.substring(0, 500), error: parseError.message });
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
        audience: q.audience || q.difficulty,
        source: 'ai-generated-gemini',
        generatedAt: new Date().toISOString()
      }));

    logger.info('Successfully generated and validated questions', {
      requested: amount,
      generated: validatedQuestions.length,
      model: 'gemini-1.5-flash'
    });

    return validatedQuestions;

  } catch (error) {
    logger.error('Error generating questions with Gemini', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

function validateQuestion(question) {
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

  if (!question.languages || !question.languages.sv || !question.languages.en) {
    logger.warn('Missing languages');
    return false;
  }

  const sv = question.languages.sv;
  if (!sv.text || !Array.isArray(sv.options) || sv.options.length !== 4 || !sv.explanation) {
    logger.warn('Invalid Swedish language data');
    return false;
  }

  const en = question.languages.en;
  if (!en.text || !Array.isArray(en.options) || en.options.length !== 4 || !en.explanation) {
    logger.warn('Invalid English language data');
    return false;
  }

  return true;
}

module.exports = {
  generateQuestions,
  CATEGORIES,
  DIFFICULTIES
};
