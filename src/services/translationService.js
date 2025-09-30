/**
 * Översättningstjänst som använder MyMemory Translation API med caching.
 */

const LINGVA_API = 'https://lingva.ml/api/v1'; // Ny primär tjänst
const MYMEMORY_API = 'https://api.mymemory.translated.net/get';
const LIBRETRANSLATE_API_1 = 'https://translate.argosopentech.com/translate';
const LIBRETRANSLATE_API_2 = 'https://trans.zillyhuhn.com/translate'; // Extra fallback
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
 * Försöker översätta text med Lingva API (ny primär tjänst).
 * @private
 */
const translateWithLingva = async (text, sourceLang, targetLang) => {
  const url = `${LINGVA_API}/${sourceLang}/${targetLang}/${encodeURIComponent(text)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Lingva API error: ${response.status}`);
  }
  const data = await response.json();
  if (data.translation) {
    return data.translation;
  }
  throw new Error('Lingva returned no valid translation.');
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
  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      q: text,
      source: sourceLang,
      target: targetLang,
      format: 'text'
    }),
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`LibreTranslate API error at ${apiUrl}: ${response.status}`);
  }
  const data = await response.json();
  return data.translatedText;
};

export const translateText = async (text, sourceLang, targetLang) => {
  if (!text || sourceLang === targetLang) {
    return text;
  }

  const cacheKey = `${sourceLang}:${targetLang}:${text}`;
  if (translationCache[cacheKey]) {
    return translationCache[cacheKey];
  }

  try {
    // Försök först med Lingva
    const translated = await translateWithLingva(text, sourceLang, targetLang);
    translationCache[cacheKey] = translated;
    saveCache();
    return translated;
  } catch (error) {
    console.warn(`Primary (Lingva) failed: ${error.message}. Trying fallback 1 (MyMemory)...`);
    try {
      // Fallback 1: MyMemory
      const translated = await translateWithMyMemory(text, sourceLang, targetLang);
      translationCache[cacheKey] = translated;
      saveCache();
      return translated;
    } catch (fallbackError) {
      console.warn(`Fallback 1 (MyMemory) failed: ${fallbackError.message}. Trying fallback 2 (Argos)...`);
      try {
        // Fallback 2: ArgosOpenTech
        const translated = await translateWithLibreTranslate(text, sourceLang, targetLang, LIBRETRANSLATE_API_1);
        translationCache[cacheKey] = translated;
        saveCache();
        return translated;
      } catch (finalFallbackError) {
        console.warn(`Fallback 2 (Argos) failed: ${finalFallbackError.message}. Trying final fallback (Zillyhuhn)...`);
        try {
          // Fallback 3: Zillyhuhn
          const translated = await translateWithLibreTranslate(text, sourceLang, targetLang, LIBRETRANSLATE_API_2);
          translationCache[cacheKey] = translated;
          saveCache();
          return translated;
        } catch (superFinalFallbackError) {
          console.error(`All translation fallbacks failed: ${superFinalFallbackError.message}. Returning original text.`);
          return text; // Returnera originaltexten om alla misslyckas
        }
      }
    }
  }
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
