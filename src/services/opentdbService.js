/**
 * Hämtar och översätter frågor från OpenTDB så att de passar tipspromenaden.
 */
import { v4 as uuidv4 } from 'uuid';

const API_BASE = 'https://opentdb.com/api.php';

/**
 * Kodar av HTML-entiteter som OpenTDB skickar tillbaka.
 */
const decodeHtmlEntities = (value) => {
  if (!value) return '';
  const decoded = decodeURIComponent(value)
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&eacute;/g, 'é')
    .replace(/&ouml;/g, 'ö')
    .replace(/&aring;/g, 'å')
    .replace(/&auml;/g, 'ä')
    .replace(/&uuml;/g, 'ü')
    .replace(/&shy;/g, '-')
    .replace(/&rsquo;/g, "'");
  return decoded;
};

const translationPairs = [
  ['Who', 'Vem'],
  ['What', 'Vad'],
  ['Which', 'Vilket'],
  ['Where', 'Var'],
  ['When', 'När'],
  ['How many', 'Hur många'],
  ['How much', 'Hur mycket'],
  ['How', 'Hur'],
  ['In what', 'I vilket'],
  ['True', 'Sant'],
  ['False', 'Falskt'],
  ['movie', 'film'],
  ['Movie', 'Film'],
  ['television', 'tv'],
  ['Television', 'TV'],
  ['video game', 'tv-spel'],
  ['Video Game', 'TV-spel'],
  ['England', 'England'],
  ['United States', 'USA'],
  ['United Kingdom', 'Storbritannien'],
  ['Germany', 'Tyskland'],
  ['France', 'Frankrike'],
  ['Sweden', 'Sverige'],
  ['Which of the following', 'Vilken av följande'],
  ['What is the name', 'Vad heter'],
  ['What is the', 'Vad är'],
  ['According to', 'Enligt'],
  ['How many times', 'Hur många gånger']
];

/**
 * Gör enklare översättningar från engelska till svenska med hjälp av ordbank.
 */
const translateToSwedish = (text) => {
  let result = decodeHtmlEntities(text);
  translationPairs.forEach(([en, sv]) => {
    result = result.replace(new RegExp(`\b${en}\b`, 'gi'), (match) => {
      if (match[0].toUpperCase() === match[0]) {
        // Preserve capitalization on first letter
        const capitalized = sv.charAt(0).toUpperCase() + sv.slice(1);
        return capitalized;
      }
      return sv;
    });
  });
  return result;
};

/**
 * Konverterar OpenTDB-kategorier till svenska namn.
 */
const translateCategory = (category) => {
  const map = {
    'General Knowledge': 'Allmänbildning',
    'Entertainment: Books': 'Underhållning: Böcker',
    'Entertainment: Film': 'Underhållning: Film',
    'Entertainment: Music': 'Underhållning: Musik',
    'Entertainment: Television': 'Underhållning: TV',
    'Entertainment: Video Games': 'Underhållning: TV-spel',
    'Entertainment: Board Games': 'Underhållning: Brädspel',
    'Science & Nature': 'Vetenskap & Natur',
    'Science: Computers': 'Vetenskap: Datorer',
    'Science: Mathematics': 'Vetenskap: Matematik',
    'Mythology': 'Myter & Legender',
    'Sports': 'Sport',
    'Geography': 'Geografi',
    'History': 'Historia',
    'Politics': 'Politik',
    'Art': 'Konst',
    'Celebrities': 'Kändisar',
    'Animals': 'Djur',
    'Vehicles': 'Fordon',
    'Entertainment: Comics': 'Underhållning: Serier',
    'Science: Gadgets': 'Vetenskap: Prylar',
    'Entertainment: Cartoon & Animations': 'Underhållning: Tecknat'
  };
  return map[category] || translateToSwedish(category);
};

/**
 * Bestämmer om frågan ska riktas till barn/familj eller vuxna.
 */
const mapAudience = (category, difficulty) => {
  if (/Children|Kids|Family|Cartoon|Video Game/i.test(category)) {
    return 'family';
  }
  if (difficulty === 'easy') {
    return 'family';
  }
  if (difficulty === 'medium') {
    return 'adult';
  }
  return 'adult';
};

/**
 * Mappar OpenTDB:s difficulty till våra nivåer.
 */
const mapDifficulty = (difficulty) => {
  switch (difficulty) {
    case 'easy':
      return 'family';
    case 'medium':
      return 'family';
    case 'hard':
    default:
      return 'adult';
  }
};

/**
 * Slumpar ordningen på svarsalternativen.
 */
const shuffleArray = (array) => {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * Omvandlar en OpenTDB-fråga till vårt interna format.
 */
const convertQuestion = (remote, overrideAudience) => {
  const baseAudience = mapAudience(remote.category, remote.difficulty);
  const audience = overrideAudience || baseAudience;
  const difficulty = mapDifficulty(remote.difficulty);

  const decodedCorrect = translateToSwedish(remote.correct_answer);
  const decodedIncorrect = remote.incorrect_answers.map((answer) => translateToSwedish(answer));
  const shuffledOptions = shuffleArray([...decodedIncorrect, decodedCorrect]);
  const correctOption = shuffledOptions.findIndex((option) => option === decodedCorrect);

  return {
    id: `opentdb-${uuidv4()}`,
    difficulty,
    audience,
    category: translateCategory(remote.category),
    text: translateToSwedish(remote.question),
    options: shuffledOptions,
    correctOption,
    explanation: 'Importerad från OpenTDB',
    source: 'OpenTDB'
  };
};

export const opentdbService = {
  /**
   * Hämtar frågor från OpenTDB-API:et och konverterar dem till vårt format.
   */
  async fetchQuestions({ amount = 10, difficulty, category, audience } = {}) {
    const params = new URLSearchParams({ amount: String(amount), type: 'multiple', encode: 'url3986' });
    if (difficulty && difficulty !== 'family') {
      params.set('difficulty', difficulty === 'adult' ? 'hard' : difficulty);
    }
    if (category) {
      params.set('category', String(category));
    }

    const response = await fetch(`${API_BASE}?${params.toString()}`);
    if (!response.ok) {
      throw new Error('Kunde inte hämta frågor från OpenTDB');
    }
    const payload = await response.json();
    if (payload.response_code !== 0 || !payload.results) {
      throw new Error('OpenTDB returnerade inga frågor');
    }

    return payload.results.map((question) => convertQuestion(question, audience));
  }
};
