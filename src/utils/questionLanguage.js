/**
 * Hjälpfunktioner för att hantera flerspråkiga frågor
 */

/**
 * Hämtar frågetexten på önskat språk med fallback
 * @param {Object} question - Frågeobjekt med languages-struktur
 * @param {string} preferredLanguage - Önskat språk (t.ex. 'sv' eller 'en')
 * @returns {Object} - { text, options, explanation }
 */
export const getQuestionInLanguage = (question, preferredLanguage = 'sv') => {
  if (!question) {
    return { text: '', options: [], explanation: '' };
  }

  // Om frågan har languages-struktur
  if (question.languages && typeof question.languages === 'object') {
    // Försök hämta önskat språk
    if (question.languages[preferredLanguage]) {
      return {
        text: question.languages[preferredLanguage].text || '',
        options: question.languages[preferredLanguage].options || [],
        explanation: question.languages[preferredLanguage].explanation || ''
      };
    }

    // Fallback: försök svenska först
    if (preferredLanguage !== 'sv' && question.languages.sv) {
      return {
        text: question.languages.sv.text || '',
        options: question.languages.sv.options || [],
        explanation: question.languages.sv.explanation || ''
      };
    }

    // Fallback: försök engelska
    if (preferredLanguage !== 'en' && question.languages.en) {
      return {
        text: question.languages.en.text || '',
        options: question.languages.en.options || [],
        explanation: question.languages.en.explanation || ''
      };
    }

    // Fallback: ta första tillgängliga språket
    const availableLanguages = Object.keys(question.languages);
    if (availableLanguages.length > 0) {
      const firstLang = question.languages[availableLanguages[0]];
      return {
        text: firstLang.text || '',
        options: firstLang.options || [],
        explanation: firstLang.explanation || ''
      };
    }
  }

  // Fallback för gamla frågor utan languages-struktur
  return {
    text: question.text || '',
    options: question.options || [],
    explanation: question.explanation || ''
  };
};

/**
 * Kontrollerar vilka språk en fråga har tillgängliga
 * @param {Object} question - Frågeobjekt
 * @returns {string[]} - Array med språkkoder, t.ex. ['sv', 'en']
 */
export const getAvailableLanguages = (question) => {
  if (!question) return [];

  if (question.languages && typeof question.languages === 'object') {
    return Object.keys(question.languages);
  }

  // Om frågan har gamla strukturen, anta svenska
  if (question.text) {
    return ['sv'];
  }

  return [];
};

/**
 * Kontrollerar om en fråga har ett specifikt språk
 * @param {Object} question - Frågeobjekt
 * @param {string} language - Språkkod
 * @returns {boolean}
 */
export const hasLanguage = (question, language) => {
  return getAvailableLanguages(question).includes(language);
};

/**
 * Normaliserar en fråga för att säkerställa languages-struktur
 * Om frågan saknar languages men har text/options, skapa sv-version
 * @param {Object} question - Frågeobjekt
 * @returns {Object} - Normaliserad fråga med languages-struktur
 */
export const normalizeQuestion = (question) => {
  if (!question) return null;

  // Om frågan redan har languages, returnera som den är
  if (question.languages && typeof question.languages === 'object') {
    return question;
  }

  // Om frågan har gamla strukturen, konvertera till languages
  if (question.text || question.options) {
    return {
      ...question,
      languages: {
        sv: {
          text: question.text || '',
          options: question.options || [],
          explanation: question.explanation || ''
        }
      }
    };
  }

  return question;
};