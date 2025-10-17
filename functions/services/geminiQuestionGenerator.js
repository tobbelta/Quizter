/**
 * AI-baserad frågegenerering med Google Gemini
 * Används som tredje fallback om både Anthropic och OpenAI misslyckas
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
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
const TARGET_AUDIENCES = ['swedish', 'international']; // swedish = svensk kontext, international = global kontext

/**
 * Genererar frågor med Google Gemini SDK
 * @param {Object} options - Genereringsalternativ
 * @param {number} options.amount - Antal frågor att generera (default: 10)
 * @param {string|Array} options.category - Specifik kategori eller lista av kategorier (valfri)
 * @param {string|Array} options.ageGroup - Åldersgrupp(er): children, youth, adults (valfri, kan vara array)
 * @param {string} options.targetAudience - Målgrupp: swedish (default), english, etc.
 * @param {string} apiKey - Gemini API-nyckel
 * @returns {Promise<Array>} Array med genererade frågor
 */
async function generateQuestions({ amount = 10, category = null, ageGroup = null, targetAudience = 'swedish' }, apiKey) {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }

  // Hitta tillgänglig modell dynamiskt
  const listResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );

  if (!listResponse.ok) {
    throw new Error('Failed to list Gemini models');
  }

  const modelData = await listResponse.json();
  const availableModels = modelData.models || [];
  const compatibleModel = availableModels.find(m =>
    m.supportedGenerationMethods?.includes('generateContent')
  );

  if (!compatibleModel) {
    throw new Error('No compatible Gemini models found');
  }

  const modelName = compatibleModel.name.replace('models/', '');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  // Översätt åldersgrupp till läsbart format med STRIKTA kriterier
  const ageGroupMapping = {
    'children': 'barn (6-12 år) - ENDAST mycket enkla frågor med konkreta, vardagliga ämnen som barn känner till. Enkla ord, tydliga svar. Exempel: "Vilken färg har himlen?" eller "Hur många ben har en hund?". ABSOLUT INTE: abstrakta koncept, komplexa fakta, kulturella referenser som barn inte känner till. Sätt targetAudience till "swedish".',
    'youth': 'ungdomar (13-25 år) - MÅSTE ALLTID ha INTERNATIONELL inriktning och global räckvidd. Frågor ska handla om globala fenomen som ungdomar världen över känner till, INTE om nationella eller lokala förhållanden. Ungdomar intresserar sig för kategorier (sociala medier, musik, film, sport, gaming, tech) snarare än geografiska begränsningar. INKLUDERA FLER FRÅGOR OM: Internationella influencers på TikTok/Instagram/Snapchat/YouTube och deras liv, virala trender, challenges, memes, internationella kändisar och deras aktuella händelser, globala popkultur-fenomen. Exempel PÅ RÄTT: "Vilket år lanserades TikTok?", "Vem har flest följare på Instagram 2024?", "Vilken TikTok-influencer blev känd för dansvideos 2020?", "Vilket år lanserades Snapchat?", "Vem vann fotbolls-VM 2022?", "Vilken artist har flest streams på Spotify?", "Vilket Netflix-original blev mest streamat 2023?", "Vilken YouTuber har flest prenumeranter?". Exempel PÅ FEL: "Vem är Sveriges statsminister?", "Vilken svensk artist...?", "Vilket lag vann Allsvenskan...?", "Vilken svensk influencer...?". Sätt ALLTID targetAudience till "international".',
    'adults': 'vuxna (25+ år) - Utmanande frågor som kräver allmänbildning, historisk kunskap, eller samhällskunskap. Svensk kontext med svenska förhållanden. KRÄVER: vuxen kunskapsnivå, abstrakt tänkande. Exempel: "När infördes allmän rösträtt i Sverige?" eller "Vad är BNP?". Sätt targetAudience till "swedish".'
  };

  // Hantera kategorier (kan vara en sträng eller array)
  const categories = Array.isArray(category) ? category : (category ? [category] : null);
  const categoryPrompt = categories && categories.length > 0
    ? `Alla frågor ska handla om kategorierna: ${categories.join(', ')}. En fråga kan täcka flera kategorier om det passar.`
    : `Frågorna ska täcka olika kategorier: ${CATEGORIES.join(', ')}. En fråga kan ha flera kategorier om det passar ämnet.`;

  // Hantera åldersgrupper (kan vara en sträng eller array)
  const ageGroups = Array.isArray(ageGroup) ? ageGroup : (ageGroup ? [ageGroup] : null);
  const ageGroupPrompt = ageGroups && ageGroups.length > 0
    ? `Frågorna ska passa för: ${ageGroups.map(ag => ageGroupMapping[ag] || ag).join(', ')}. Var MYCKET STRIKT - välj endast EN åldersgrupp per fråga baserat på svårighetsgrad och kunskap som krävs. Tagga ALDRIG en fråga för flera åldersgrupper såvida den inte genuint kräver exakt samma kunskapsnivå för båda grupperna (mycket sällsynt).`
    : `Blanda olika åldersgrupper: barn (children), ungdomar (youth), vuxna (adults). Var MYCKET STRIKT - varje fråga ska ha ENDAST EN åldersgrupp baserat på svårighetsgrad och kunskap som krävs. Multi-age ska vara extremt sällsynt.`;

  const targetAudienceContext = targetAudience === 'swedish'
    ? 'KRITISKT VIKTIGT - Målgrupp per åldersgrupp:\n- Barnfrågor (children): Svensk kontext (svenska förhållanden, svensk geografi, svensk kultur). Sätt targetAudience till "swedish".\n- Ungdomsfrågor (youth): MÅSTE ALLTID ha INTERNATIONELL kontext - frågor om globala fenomen som ungdomar världen över känner till. Ungdomar definieras av KATEGORIER (sociala medier, gaming, musik, streaming, internationell sport, tech, film) INTE av geografiska gränser. Inkludera FLER frågor om: Internationella TikTok/Instagram/Snapchat/YouTube-influencers och creators (t.ex. Charli D\'Amelio, Addison Rae, Khaby Lame, MrBeast, Emma Chamberlain), deras liv, samarbeten, virala moment, challenges, memes, globala kändisar och aktuella händelser i deras liv (t.ex. Billie Eilish, Dua Lipa, The Weeknd, BTS, Taylor Swift), Netflix-serier och filmer, streaming-trender. Undvik allt svenskt eller lokalt. Sätt ALLTID targetAudience till "international".\n- Vuxenfrågor (adults): Svensk kontext (svenska förhållanden, svensk historia, svenskt samhälle). Sätt targetAudience till "swedish".'
    : 'Alla frågor ska ha internationellt perspektiv. Sätt targetAudience till "international".';

  const prompt = `Du är en expert på att skapa quizfrågor. Generera ${amount} flervalsfrågor på både svenska och engelska.

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
- ageGroups är en ARRAY men ska NÄSTAN ALLTID innehålla endast EN åldersgrupp: children, youth, eller adults
- VAR MYCKET STRIKT MED ÅLDERSINDELNING:
  * Barnfrågor (children): Endast mycket enkla frågor som 6-åringar kan svara på. Svensk kontext. targetAudience="swedish".
  * Ungdomsfrågor (youth): MÅSTE ALLTID ha global räckvidd och internationell inriktning. Ungdomar definieras av KATEGORIER och INTRESSEN (TikTok, Instagram, YouTube, Spotify, Netflix, gaming, internationell fotboll, NBA, F1, tech-trender), INTE av geografiska gränser. INKLUDERA FLER FRÅGOR OM: Internationella influencers och creators (TikTok-stjärnor, Instagram-profiler, YouTubers, Snapchat-creators), deras liv, virala trender, challenges, memes, popkultur-ikoner och aktuella händelser. Undvik ALLT som är svenskt, lokalt eller nationellt. targetAudience="international".
  * Vuxenfrågor (adults): Frågor som kräver allmänbildning, historisk kunskap, eller vuxen erfarenhet. Svensk kontext. targetAudience="swedish".
  * EXEMPEL PÅ FEL för ungdomsfrågor: "Vem är Sveriges statsminister?", "Vilket lag vann Allsvenskan?", "Vilken svensk YouTuber...?", "Vilken stad är Sveriges näst största?", "Vilken svensk influencer...?"
  * EXEMPEL PÅ RÄTT för ungdomsfrågor: "Vilket år lanserades Instagram?", "Vem har flest följare på TikTok 2024?", "Vilken TikTok-creator är känd för sina tysta komedivideos?", "Vilket land vann fotbolls-VM 2022?", "Vem spelar Spider-Man i MCU?", "Vilket spel skapades av Mojang?", "Vilken YouTuber är känd för sina dyra challenges och giveaways?", "Vilket år lanserades Snapchat?", "Vilken Netflix-serie blev mest streamad 2023?"
  * Multi-age tagging ska vara EXTREMT SÄLLSYNT (< 5% av frågor)
- targetAudience ska vara: ${targetAudience}
- Svara ENDAST med giltig JSON, ingen markdown eller annan formatering`;

  try {
    logger.info('Generating questions with Gemini SDK', { amount, category, ageGroup, targetAudience });

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
          source: 'ai-generated-gemini',
          generatedAt: new Date().toISOString()
        };
      });

    logger.info('Successfully generated and validated questions', {
      requested: amount,
      generated: validatedQuestions.length,
      model: 'gemini-pro'
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
 * @param {string} apiKey - Gemini API-nyckel
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
