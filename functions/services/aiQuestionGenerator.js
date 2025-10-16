/**
 * AI-baserad frågegenerering med Anthropic Claude
 * Genererar frågor på både svenska och engelska med kategorier och svårighetsgrader
 */
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const logger = require('firebase-functions/logger');

// Svenska kategorier (inkl. sociala medier och sport)
const CATEGORIES = [
  'Geografi', 'Historia', 'Naturvetenskap', 'Kultur', 'Sport', 'Natur', 'Teknik', 'Djur', 'Gåtor',
  'YouTube', 'TikTok', 'Instagram', 'Snapchat', 'Threads', 'Bluesky', 'Facebook', 'Idrott'
];

// Åldersgrupper (ersätter svårighetsgrader) - en fråga kan passa flera åldersgrupper
const AGE_GROUPS = ['children', 'youth', 'adults'];

// Målgrupper
const TARGET_AUDIENCES = ['swedish']; // Kan utökas senare med 'english', 'german', etc.

/**
 * Genererar frågor med Anthropic Claude
 * @param {Object} options - Genereringsalternativ
 * @param {number} options.amount - Antal frågor att generera (default: 10)
 * @param {string|Array} options.category - Specifik kategori eller lista av kategorier (valfri)
 * @param {string|Array} options.ageGroup - Åldersgrupp(er): children, youth, adults (valfri, kan vara array)
 * @param {string} options.targetAudience - Målgrupp: swedish (default), english, etc.
 * @param {string} apiKey - Anthropic API-nyckel
 * @returns {Promise<Array>} Array med genererade frågor
 */
async function generateQuestions({ amount = 10, category = null, ageGroup = null, targetAudience = 'swedish' }, apiKey) {
  if (!apiKey) {
    throw new Error('Anthropic API key is required');
  }

  const anthropic = new Anthropic({ apiKey });

  // Översätt åldersgrupp till läsbart format
  const ageGroupMapping = {
    'children': 'barn (6-12 år, enkla och roliga frågor anpassade för barn, svensk kontext med svenska förhållanden och kultur)',
    'youth': 'ungdomar (13-25 år, moderna frågor om sociala medier, populärkultur, idrott och aktuella trender, globalt perspektiv)',
    'adults': 'vuxna (25+ år, utmanande frågor om samhälle, historia, kultur och vetenskap, svensk kontext med svenska förhållanden)'
  };

  // Hantera kategorier (kan vara en sträng eller array)
  const categories = Array.isArray(category) ? category : (category ? [category] : null);
  const categoryPrompt = categories && categories.length > 0
    ? `Alla frågor ska handla om kategorierna: ${categories.join(', ')}. En fråga kan täcka flera kategorier om det passar.`
    : `Frågorna ska täcka olika kategorier: ${CATEGORIES.join(', ')}. En fråga kan ha flera kategorier om det passar ämnet.`;

  // Hantera åldersgrupper (kan vara en sträng eller array)
  const ageGroups = Array.isArray(ageGroup) ? ageGroup : (ageGroup ? [ageGroup] : null);
  const ageGroupPrompt = ageGroups && ageGroups.length > 0
    ? `Frågorna ska passa för: ${ageGroups.map(ag => ageGroupMapping[ag] || ag).join(', ')}. Om en fråga kan passa flera åldersgrupper, markera den för alla relevanta grupper.`
    : `Blanda olika åldersgrupper: barn (children), ungdomar (youth), vuxna (adults). Frågor kan passa flera åldersgrupper samtidigt.`;

  const targetAudienceContext = targetAudience === 'swedish'
    ? 'Frågor för barn och vuxna ska ha svensk kontext (svenska förhållanden, svensk geografi, svensk kultur, svenska förebilder). Ungdomsfrågor KAN ha antingen svensk eller internationell kontext - om frågan är internationell (globala fenomen, internationell populärkultur, sociala medier), sätt targetAudience till "international".'
    : 'Frågor ska ha internationellt perspektiv.';

  const systemPrompt = `Du är en expert på att skapa quizfrågor. Generera ${amount} flervalsfrågor på både svenska och engelska.

Krav:
- Varje fråga ska ha exakt 4 svarsalternativ (A, B, C, D)
- Endast ett korrekt svar
- Inkludera en kort förklaring till det korrekta svaret
- ${categoryPrompt}
- ${ageGroupPrompt}
- ${targetAudienceContext}
- Frågorna ska vara intressanta, pedagogiska och lämpliga för målgruppen
- Undvik kontroversiella eller stötande ämnen
- Gör frågorna tydliga och entydiga
- Perfekt stavning och grammatik är KRITISKT viktigt

Svara ENDAST med en giltig JSON-array med denna exakta struktur:
{
  "questions": [
    {
      "categories": ["Geografi"],
      "ageGroups": ["adults"],
      "targetAudience": "${targetAudience}",
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
- categories är en ARRAY och kan innehålla flera kategorier om frågan täcker flera ämnen: ${CATEGORIES.join(', ')}
- ageGroups är en ARRAY och kan innehålla flera åldersgrupper om frågan passar för flera: children, youth, adults
- En fråga som passar både barn och vuxna ska ha: "ageGroups": ["children", "adults"]
- targetAudience ska vara: ${targetAudience}
- Svara ENDAST med giltig JSON, ingen markdown eller annan formatering`;

  try {
    logger.info('Generating questions with Anthropic Claude', { amount, category, ageGroup, targetAudience });

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
      .map(q => {
        // Ta bort gamla fält från objektet
        const { category, difficulty, audience, ageGroup, ...cleanQuestion } = q;

        return {
          id: uuidv4(),
          ...cleanQuestion,
          // Säkerställ att categories är en array
          categories: Array.isArray(cleanQuestion.categories) ? cleanQuestion.categories : ['Gåtor'],
          // Säkerställ att ageGroups är en array
          ageGroups: Array.isArray(cleanQuestion.ageGroups) ? cleanQuestion.ageGroups : ['adults'],
          source: 'ai-generated-anthropic',
          generatedAt: new Date().toISOString()
        };
      });

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
  // Kontrollera categories (måste vara array med minst en giltig kategori)
  if (!question.categories || !Array.isArray(question.categories) || question.categories.length === 0) {
    logger.warn('Missing or invalid categories', { categories: question.categories });
    return false;
  }

  // Kontrollera att åtminstone en kategori är giltig
  const hasValidCategory = question.categories.some(cat => CATEGORIES.includes(cat));
  if (!hasValidCategory) {
    logger.warn('No valid categories found', { categories: question.categories });
    return false;
  }

  // Kontrollera ageGroups (måste vara array med minst en giltig åldersgrupp)
  if (!question.ageGroups || !Array.isArray(question.ageGroups) || question.ageGroups.length === 0) {
    logger.warn('Missing or invalid ageGroups', { ageGroups: question.ageGroups });
    return false;
  }

  // Kontrollera att åtminstone en åldersgrupp är giltig
  const hasValidAgeGroup = question.ageGroups.some(ag => AGE_GROUPS.includes(ag));
  if (!hasValidAgeGroup) {
    logger.warn('No valid ageGroups found', { ageGroups: question.ageGroups });
    return false;
  }

  // Kontrollera targetAudience
  if (!question.targetAudience || !TARGET_AUDIENCES.includes(question.targetAudience)) {
    logger.warn('Invalid targetAudience', { targetAudience: question.targetAudience });
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
 * Genererar frågor för specifika kategorier och åldersgrupp
 * @param {string|Array} category - Kategori eller lista av kategorier
 * @param {string} ageGroup - Åldersgrupp
 * @param {number} amount - Antal frågor
 * @param {string} apiKey - Anthropic API-nyckel
 * @param {string} targetAudience - Målgrupp (default: swedish)
 * @returns {Promise<Array>} Array med frågor
 */
async function generateQuestionsForCategory(category, ageGroup, amount, apiKey, targetAudience = 'swedish') {
  return generateQuestions({ amount, category, ageGroup, targetAudience }, apiKey);
}

module.exports = {
  generateQuestions,
  generateQuestionsForCategory,
  CATEGORIES,
  AGE_GROUPS,
  TARGET_AUDIENCES
};
