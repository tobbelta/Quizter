/**
 * Översättningstjänst som använder flera gratis API:er med caching.
 * Fallback-kedja för maximal tillförlitlighet.
 */

// Lista med stabila gratis översättningstjänster
const GOOGLE_TRANSLATE_API = 'https://translate.googleapis.com/translate_a/single';
const MYMEMORY_API = 'https://api.mymemory.translated.net/get';
const LIBRETRANSLATE_API_1 = 'https://translate.terraprint.co/translate'; // Stabil LibreTranslate instance
const LIBRETRANSLATE_API_2 = 'https://translate.fedilab.app/translate'; // Backup LibreTranslate
const CACHE_KEY = 'translationCache';
let translationCache = {};

// Läs in cache från localStorage vid start
if (typeof window !== 'undefined') {
  try {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      translationCache = JSON.parse(cachedData);
    }
  } catch (error) {
    console.warn('Kunde inte läsa översättningscache:', error);
  }
}

const saveCache = () => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(translationCache));
    } catch (error) {
      console.warn('Kunde inte spara översättningscache:', error);
    }
  }
};

/**
 * Försöker översätta med Google Translate (mest pålitlig tjänst).
 * @private
 */
const translateWithGoogle = async (text, sourceLang, targetLang) => {
  const url = `${GOOGLE_TRANSLATE_API}?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Google Translate API error: ${response.status}`);
  }

  const data = await response.json();

  // Google returnerar format: [[[översättning, original, null, null, score]]]
  if (data && Array.isArray(data) && data[0] && Array.isArray(data[0])) {
    const translations = data[0]
      .filter(item => item && item[0])
      .map(item => item[0]);

    if (translations.length > 0) {
      return translations.join(' ');
    }
  }

  throw new Error('Google Translate returned no valid translation.');
};

/**
 * Enkel regelbaserad översättning som alltid fungerar för vanliga ord.
 * Används som absolut sista fallback.
 * @private
 */
const translateWithDictionary = (text, sourceLang, targetLang) => {
  // Om källspråk = målspråk, returnera som det är
  if (sourceLang === targetLang) {
    return text;
  }

  // Enkel ordbok för vanliga ord
  const dictionary = {
    'en-sv': {
      'What': 'Vad',
      'Who': 'Vem',
      'Where': 'Var',
      'When': 'När',
      'Why': 'Varför',
      'How': 'Hur',
      'True': 'Sant',
      'False': 'Falskt',
      'Yes': 'Ja',
      'No': 'Nej',
      'is': 'är',
      'the': 'den',
      'a': 'en',
      'an': 'ett',
      'of': 'av',
      'in': 'i',
      'to': 'till',
      'and': 'och',
      'or': 'eller',
      'but': 'men',
      'not': 'inte'
    }
  };

  const dictKey = `${sourceLang}-${targetLang}`;
  const dict = dictionary[dictKey];

  if (!dict) {
    // Om vi inte har en ordbok för detta språkpar, returnera originalet
    return text;
  }

  // Enkel ordersättning
  let translated = text;
  Object.entries(dict).forEach(([eng, swe]) => {
    const regex = new RegExp(`\\b${eng}\\b`, 'gi');
    translated = translated.replace(regex, swe);
  });

  return translated;
};


/**
 * Försöker översätta text med MyMemory API.
 * @private
 */
const translateWithMyMemory = async (text, sourceLang, targetLang) => {
  const sourceCode = sourceLang === 'sv' ? 'sv-SE' : 'en-GB';
  const targetCode = targetLang === 'sv' ? 'sv-SE' : 'en-GB';
  const url = `${MYMEMORY_API}?q=${encodeURIComponent(text)}&langpair=${sourceCode}|${targetCode}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MyMemory API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.responseStatus === 200 && data.responseData?.translatedText) {
    return data.responseData.translatedText;
  }

  throw new Error('MyMemory returned no valid translation.');
};

/**
 * Försöker översätta text med LibreTranslate API som fallback.
 * @private
 */
const translateWithLibreTranslate = async (text, sourceLang, targetLang, apiUrl) => {
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify({
        q: text,
        source: sourceLang,
        target: targetLang,
        format: 'text',
        api_key: '' // Tomma nycklar accepteras av de flesta publika instanser
      }),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LibreTranslate API error at ${apiUrl}: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (data.translatedText && data.translatedText.trim() !== '') {
      return data.translatedText;
    }

    throw new Error('LibreTranslate returned empty translation');
  } catch (error) {
    console.error(`[LibreTranslate] Error with ${apiUrl}:`, error.message);
    throw error;
  }
};

export const translateText = async (text, sourceLang, targetLang) => {
  if (!text || sourceLang === targetLang) {
    return text;
  }

  const cacheKey = `${sourceLang}:${targetLang}:${text}`;
  if (translationCache[cacheKey]) {
    return translationCache[cacheKey];
  }

  // Lista med översättningstjänster att försöka i ordning
  // Google först eftersom det är mest pålitligt
  const translationServices = [
    { name: 'Google Translate', fn: () => translateWithGoogle(text, sourceLang, targetLang) },
    { name: 'MyMemory', fn: () => translateWithMyMemory(text, sourceLang, targetLang) },
    { name: 'LibreTranslate (Terraprint)', fn: () => translateWithLibreTranslate(text, sourceLang, targetLang, LIBRETRANSLATE_API_1) },
    { name: 'LibreTranslate (Fedilab)', fn: () => translateWithLibreTranslate(text, sourceLang, targetLang, LIBRETRANSLATE_API_2) },
    { name: 'Dictionary Fallback', fn: () => Promise.resolve(translateWithDictionary(text, sourceLang, targetLang)) }
  ];

  let lastError = null;

  // Försök med varje tjänst i ordning
  for (const service of translationServices) {
    try {
      const translated = await service.fn();
      // Validera att översättningen är giltig
      if (translated && translated.trim() !== '') {
        // Acceptera översättningen även om den är samma som originalet (kan vara korrekt för vissa ord)
        translationCache[cacheKey] = translated;
        saveCache();
        console.log(`[Translation] Success with ${service.name}`);
        return translated;
      }
    } catch (error) {
      console.warn(`[Translation] ${service.name} failed: ${error.message}`);
      lastError = error;
      // Fortsätt till nästa tjänst
    }
  }

  // Om ALLA tjänster misslyckas (inklusive dictionary fallback), kasta fel
  console.error('[Translation] All translation services failed, including fallback');
  throw new Error(`Translation failed for all services. Last error: ${lastError?.message || 'Unknown error'}`);
};

export const translateTexts = async (texts, sourceLang, targetLang) => {
  if (!texts || texts.length === 0) {
    return [];
  }

  const results = [];
  for (const text of texts) {
    const translated = await translateText(text, sourceLang, targetLang);
    results.push(translated);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return results;
};

export const detectLanguage = async (text) => {
  if (!text) {
    return 'en';
  }
  const swedishWords = ['är', 'och', 'det', 'som', 'en', 'att', 'var', 'för', 'på', 'med', 'av', 'till', 'har', 'de', 'den', 'ett', 'vad', 'vilken'];
  const englishWords = ['the', 'is', 'and', 'it', 'that', 'a', 'was', 'for', 'on', 'with', 'of', 'to', 'has', 'they', 'an', 'what', 'which'];
  const lowerText = text.toLowerCase();
  let swedishScore = 0;
  let englishScore = 0;
  swedishWords.forEach(word => {
    const regex = new RegExp(`\b${word}\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) swedishScore += matches.length;
  });
  englishWords.forEach(word => {
    const regex = new RegExp(`\b${word}\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) englishScore += matches.length;
  });
  if (/[åäö]/i.test(text)) {
    swedishScore += 10;
  }
  return swedishScore > englishScore ? 'sv' : 'en';
};

export const translationService = {
  translateText,
  translateTexts,
  detectLanguage
};
