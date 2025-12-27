/**
 * RUN FACTORY SERVICE
 * 
 * SYFTE: Fabriksfunktioner för att skapa run-objekt med checkpoints baserat på olika scenarion
 * 
 * HUVUDFUNKTIONER:
 * - createRouteBasedRun(): Skapar GPS-baserad runda med waypoints längs en rutt
 * - createDistanceBasedRun(): Skapar distansbaserad runda där frågor frisläpps efter X meter
 * - createTimeBasedRun(): Skapar tidsbaserad runda där frågor frisläpps efter X minuter
 * - countAvailableQuestions(): Räknar tillgängliga frågor för given konfiguration
 * - generateJoinCode(): Skapar unik 6-teckens joincode
 * 
 * RUN TYPES:
 * - route: GPS-waypoints, kräver användaren att röra sig till specifika platser
 * - distance: Totaldistans, frisläpper frågor baserat på tillryggalagd sträcka
 * - time: Timer-baserad, frisläpper frågor efter tidsintervall
 * 
 * QUESTION FILTERING:
 * - Filtrerar på audience (åldersgrupp)
 * - Filtrerar på difficulty (familj-mode = blandning av svårighetsgrader)
 * - Filtrerar på categories
 * - Exkluderar avvisade, rapporterade och AI-failade frågor
 * 
 * ANVÄNDNING: Anropas från RunContext.generateRun()
 */
import { v4 as uuidv4 } from 'uuid';
import { QUESTION_BANK } from '../data/questions';
import { questionService } from './questionService';
import { generateWalkingRoute } from './routeService';
import { FALLBACK_POSITION } from '../utils/constants';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Skapar en slumpad anslutningskod utan lättförväxlade tecken
 * 
 * SYFTE: Generera unik 6-teckens kod för att joina rundor
 * ANVÄNDER: A-Z (utan O och I) och 2-9 för läsbarhet
 * 
 * @returns {string} 6-teckens joincode, t.ex. "A3K9P2"
 */
const generateJoinCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Ingen O, I, 0, 1 för att undvika förväxling
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

/**
 * Hämtar den aktuella frågebanken från Cloudflare API eller fallback
 * 
 * SYFTE: Försöker ladda frågor från Cloudflare API, faller tillbaka till bundlade frågor om fel
 * 
 * @returns {Promise<Array>} Array med frågor
 */
const resolveQuestionPool = async () => {
  try {
    const questions = await questionService.loadAllQuestions();
    if (questions.length === 0) {
      return QUESTION_BANK;
    }
    return questions;
  } catch (error) {
    return QUESTION_BANK;
  }
};

/**
 * Räknar antalet godkända frågor som matchar givna kriterier
 * 
 * SYFTE: Används för att validera att det finns tillräckligt med frågor före run-skapande
 * Visar varning till användaren om för få frågor matchar kriterierna
 * 
 * FILTRERING:
 * - Exkluderar frågor med aiValidated=false, manuallyRejected=true, eller reported=true
 * - Matchar audience (ageGroups array eller difficulty string)
 * - Matchar categories (stöder både categories array och category string)
 * 
 * SPECIAL: difficulty='family' → fördelar frågor mellan barn/ungdom/vuxna
 * 
 * @param {object} options
 * @param {string} options.audience - Målgrupp (children/youth/adults)
 * @param {string} options.difficulty - Svårighetsgrad (easy/medium/hard/family)
 * @param {string[]} options.categories - Kategorier att filtrera på
 * @param {number} options.questionCount - Antal frågor som behövs
 * @returns {Promise<number>} Antal tillgängliga frågor
 * 
 * NYTT SCHEMA (stöds):
 * - ageGroups (array) istället för difficulty (string)
 * - categories (array) istället för category (string)
 */
const distributeFamilyCounts = (total) => {
  const safeTotal = Math.max(0, total);
  const base = Math.floor(safeTotal / 3);
  const remainder = safeTotal - base * 3;
  const order = ['children', 'youth', 'adults'];
  const counts = {
    children: base,
    youth: base,
    adults: base,
  };

  for (let index = 0; index < remainder; index += 1) {
    counts[order[index % order.length]] += 1;
  }

  return counts;
};

export const countAvailableQuestions = async ({ audience, difficulty, categories = [], questionCount = 0 }) => {
  const pool = await resolveQuestionPool();

  // Special case för family - räkna alla åldersgrupper separat
  if (difficulty === 'family') {
    const counts = distributeFamilyCounts(questionCount > 0 ? questionCount : 3);
    const countForAgeGroup = (ageGroup) => {
      return pool.filter((question) => {
        const isRejected = question.aiValidated === false ||
          question.manuallyRejected === true ||
          question.reported === true ||
          question.quarantined === true ||
          question.isExpired === true;
        if (isRejected) return false;

        // Matcha åldersgrupp (stöd både nytt och gammalt schema)
        let matchesAge = false;
        if (Array.isArray(question.ageGroups)) {
          matchesAge = question.ageGroups.includes(ageGroup);
        } else {
          if (ageGroup === 'children') {
            matchesAge = question.difficulty === 'kid' || question.audience === 'kid';
          } else if (ageGroup === 'youth') {
            matchesAge = question.difficulty === 'medium' || question.audience === 'medium';
          } else if (ageGroup === 'adults') {
            matchesAge = question.difficulty === 'adult' || question.audience === 'adult' ||
                         question.difficulty === 'expert' || question.difficulty === 'hard';
          }
        }

        if (!matchesAge) return false;

        // Matcha kategorier - en fråga behöver bara matcha EN av de valda
        if (categories.length === 0) return true;

        if (Array.isArray(question.categories)) {
          return question.categories.some(cat => categories.includes(cat));
        } else if (question.category) {
          return categories.includes(question.category);
        }

      return false;
    }).length;
  };

    const availableChildren = countForAgeGroup('children');
    const availableYouth = countForAgeGroup('youth');
    const availableAdults = countForAgeGroup('adults');

    if (questionCount > 0) {
      const ratios = [
        counts.children > 0 ? Math.floor(availableChildren / counts.children) : Number.POSITIVE_INFINITY,
        counts.youth > 0 ? Math.floor(availableYouth / counts.youth) : Number.POSITIVE_INFINITY,
        counts.adults > 0 ? Math.floor(availableAdults / counts.adults) : Number.POSITIVE_INFINITY,
      ].filter((ratio) => Number.isFinite(ratio));

      const maxCompleteSets = ratios.length > 0 ? Math.min(...ratios) : 0;
      return Math.max(0, maxCompleteSets) * questionCount;
    }

    return Math.min(availableChildren, availableYouth, availableAdults) * 3;
  }

  // För specifik åldersgrupp eller ingen filtrering
  const filtered = pool.filter((question) => {
    // Exkludera underkända och rapporterade frågor
    const isRejected = question.aiValidated === false ||
      question.manuallyRejected === true ||
      question.reported === true ||
      question.quarantined === true ||
      question.isExpired === true;
    if (isRejected) {
      return false;
    }

    // Filtrera efter åldersgrupp (stöd både nytt och gammalt schema)
    let matchesAgeGroup = false;

    if (Array.isArray(question.ageGroups) && question.ageGroups.length > 0) {
      matchesAgeGroup = question.ageGroups.includes(difficulty);
    } else {
      // Gammalt schema fallback
      if (difficulty === 'children' || difficulty === 'kid') {
        matchesAgeGroup = question.audience === 'kid' || question.difficulty === 'kid';
      } else if (difficulty === 'youth' || difficulty === 'medium') {
        matchesAgeGroup = question.audience === 'medium' || question.difficulty === 'medium';
      } else if (difficulty === 'adults' || difficulty === 'adult') {
        matchesAgeGroup = question.audience === 'adult' || question.difficulty === 'adult';
      } else {
        matchesAgeGroup = true;
      }
    }

    // Filtrera efter kategorier - en fråga behöver bara matcha EN av de valda
    let matchesCategory = false;
    if (categories.length === 0) {
      matchesCategory = true;
    } else {
      if (Array.isArray(question.categories)) {
        matchesCategory = question.categories.some(cat => categories.includes(cat));
      } else if (question.category) {
        matchesCategory = categories.includes(question.category);
      }
    }

    return matchesAgeGroup && matchesCategory;
  });

  return filtered.length;
};

/**
 * Filtrerar och väljer ut rätt antal frågor baserat på målgrupp, svårighet och kategorier.
 * Exkluderar underkända frågor och förhindrar duplicerade frågor i samma runda.
 *
 * NYTT SCHEMA:
 * - difficulty/ageGroup: 'children', 'youth', 'adults', eller 'family' (33/33/33)
 * - question.ageGroups: array av åldersgrupper som frågan passar för
 * - question.categories: array av kategorier (kan vara flera)
 */
const pickQuestions = async ({ audience, difficulty, questionCount, categories = [] }) => {
  const pool = await resolveQuestionPool();

  if (pool.length === 0) {
    throw new Error('Frågebanken är tom. Kontrollera att frågor har laddats korrekt från databasen.');
  }

  if (questionCount < 1 || questionCount > 50) {
    throw new Error(`Ogiltigt antal frågor (${questionCount}). Välj mellan 1 och 50 frågor.`);
  }

  // Special handling för family mode - blanda 33/33/33 från alla åldersgrupper
  if (difficulty === 'family') {
    return pickFamilyQuestions(pool, questionCount, categories);
  }

  // Filtrera frågor baserat på åldersgrupp och kategorier
  const filtered = pool.filter((question) => {
    // VIKTIGT: Exkludera alla underkända och rapporterade frågor
    const isRejected = question.aiValidated === false ||
      question.manuallyRejected === true ||
      question.reported === true ||
      question.quarantined === true ||
      question.isExpired === true;
    if (isRejected) {
      return false;
    }

    // Stöd både nytt schema (ageGroups array) och gammalt schema (difficulty/audience string)
    let matchesAgeGroup = false;

    if (Array.isArray(question.ageGroups) && question.ageGroups.length > 0) {
      // NYTT SCHEMA: Kolla om frågan passar för vald åldersgrupp
      matchesAgeGroup = question.ageGroups.includes(difficulty);
    } else {
      // GAMMALT SCHEMA: Fallback till gamla fälten
      if (difficulty === 'children' || difficulty === 'kid') {
        matchesAgeGroup = question.audience === 'kid' || question.difficulty === 'kid';
      } else if (difficulty === 'youth' || difficulty === 'medium') {
        matchesAgeGroup = question.audience === 'medium' || question.difficulty === 'medium';
      } else if (difficulty === 'adults' || difficulty === 'adult') {
        matchesAgeGroup = question.audience === 'adult' || question.difficulty === 'adult';
      } else {
        matchesAgeGroup = true;
      }
    }

    // Filtrera efter kategorier (stöd både array och string)
    let matchesCategory = false;
    if (categories.length === 0) {
      matchesCategory = true;
    } else {
      // NYTT SCHEMA: categories är array
      if (Array.isArray(question.categories)) {
        matchesCategory = question.categories.some(cat => categories.includes(cat));
      } else if (question.category) {
        // GAMMALT SCHEMA: category är string
        matchesCategory = categories.includes(question.category);
      }
    }

    return matchesAgeGroup && matchesCategory;
  });

  const shuffled = [...filtered].sort(() => Math.random() - 0.5);

  if (shuffled.length === 0) {
    const categoryText = categories.length > 0 ? ` och kategorier (${categories.join(', ')})` : '';
    throw new Error(`Inga godkända frågor matchar vald åldersgrupp (${difficulty})${categoryText}. Prova en annan kombination eller validera fler frågor.`);
  }

  if (shuffled.length < questionCount) {
    const categoryText = categories.length > 0 ? ` och kategorier (${categories.join(', ')})` : '';
    throw new Error(
      `Det finns endast ${shuffled.length} godkända frågor som matchar vald åldersgrupp (${difficulty})${categoryText}, men du behöver ${questionCount} frågor.\n\n` +
      `Välj ett lägre antal frågor eller validera fler frågor i frågebanken.`
    );
  }

  return shuffled.slice(0, questionCount);
};

/**
 * Väljer frågor för family mode - blandar 33% children, 33% youth, 33% adults
 * @param {Array} pool - Alla tillgängliga frågor
 * @param {number} questionCount - Totalt antal frågor att välja
 * @param {Array} categories - Valda kategorier att filtrera på
 * @returns {Array} Blandade frågor från alla tre åldersgrupper
 */
const pickFamilyQuestions = (pool, questionCount, categories) => {
  // Filtrera ut godkända frågor för varje åldersgrupp
  const getQuestionsForAgeGroup = (ageGroup) => {
    return pool.filter((question) => {
      // Exkludera underkända/rapporterade
      const isRejected = question.aiValidated === false ||
        question.manuallyRejected === true ||
        question.reported === true ||
        question.quarantined === true ||
        question.isExpired === true;
      if (isRejected) return false;

      // Matcha åldersgrupp (stöd både nytt och gammalt schema)
      let matchesAge = false;
      if (Array.isArray(question.ageGroups)) {
        matchesAge = question.ageGroups.includes(ageGroup);
      } else {
        // Gammalt schema mapping
        if (ageGroup === 'children') {
          matchesAge = question.difficulty === 'kid' || question.audience === 'kid';
        } else if (ageGroup === 'youth') {
          matchesAge = question.difficulty === 'medium' || question.audience === 'medium';
        } else if (ageGroup === 'adults') {
          matchesAge = question.difficulty === 'adult' || question.audience === 'adult' ||
                       question.difficulty === 'expert' || question.difficulty === 'hard';
        }
      }

      if (!matchesAge) return false;

      // Matcha kategorier (om några är valda)
      if (categories.length === 0) return true;

      if (Array.isArray(question.categories)) {
        return question.categories.some(cat => categories.includes(cat));
      } else if (question.category) {
        return categories.includes(question.category);
      }

      return false;
    });
  };

  // Hämta frågor för varje åldersgrupp
  const childrenQuestions = getQuestionsForAgeGroup('children');
  const youthQuestions = getQuestionsForAgeGroup('youth');
  const adultsQuestions = getQuestionsForAgeGroup('adults');

  // Beräkna hur många frågor från varje grupp (33/33/33-fördelning med rester)
  const distribution = distributeFamilyCounts(questionCount);
  const childrenCount = distribution.children;
  const youthCount = distribution.youth;
  const adultsCount = distribution.adults;

  // Validera att vi har tillräckligt många frågor i varje grupp
  if (childrenQuestions.length < childrenCount) {
    const categoryText = categories.length > 0 ? ` och kategorier (${categories.join(', ')})` : '';
    throw new Error(
      `För få barnfrågor tillgängliga${categoryText}. Behöver ${childrenCount} men har bara ${childrenQuestions.length}.\n\n` +
      `Validera fler barnfrågor eller välj färre frågor totalt.`
    );
  }
  if (youthQuestions.length < youthCount) {
    const categoryText = categories.length > 0 ? ` och kategorier (${categories.join(', ')})` : '';
    throw new Error(
      `För få ungdomsfrågor tillgängliga${categoryText}. Behöver ${youthCount} men har bara ${youthQuestions.length}.\n\n` +
      `Validera fler ungdomsfrågor eller välj färre frågor totalt.`
    );
  }
  if (adultsQuestions.length < adultsCount) {
    const categoryText = categories.length > 0 ? ` och kategorier (${categories.join(', ')})` : '';
    throw new Error(
      `För få vuxenfrågor tillgängliga${categoryText}. Behöver ${adultsCount} men har bara ${adultsQuestions.length}.\n\n` +
      `Validera fler vuxenfrågor eller välj färre frågor totalt.`
    );
  }

  // Shuffla och välj från varje grupp
  const selectedChildren = [...childrenQuestions]
    .sort(() => Math.random() - 0.5)
    .slice(0, childrenCount);

  const selectedYouth = [...youthQuestions]
    .sort(() => Math.random() - 0.5)
    .slice(0, youthCount);

  const selectedAdults = [...adultsQuestions]
    .sort(() => Math.random() - 0.5)
    .slice(0, adultsCount);

  const selections = {
    children: selectedChildren,
    youth: selectedYouth,
    adults: selectedAdults,
  };

  const order = ['children', 'youth', 'adults'].sort(() => Math.random() - 0.5);
  const combined = [];
  let index = 0;
  while (combined.length < questionCount) {
    let pushed = false;
    for (const group of order) {
      const items = selections[group];
      if (index < items.length) {
        combined.push(items[index]);
        pushed = true;
        if (combined.length === questionCount) {
          break;
        }
      }
    }

    if (!pushed) {
      break;
    }
    index += 1;
  }

  return combined;
};

/**
 * Skapar checkpoint-listan för en handplanerad runda. Placeringarna sprids runt startposition.
 */
const createHostedCheckpoints = (questions, origin = FALLBACK_POSITION) => questions.map((question, index) => {
  // Skapa en liten cirkel runt startpunkten
  const angle = (index / questions.length) * Math.PI * 2;
  const radius = 0.002; // Cirka 200m radie
  const offsetLat = Math.sin(angle) * radius;
  const offsetLng = Math.cos(angle) * radius;

  return {
    order: index + 1,
    location: {
      lat: origin.lat + offsetLat + (Math.random() - 0.5) * 0.001, // Lite variation
      lng: origin.lng + offsetLng + (Math.random() - 0.5) * 0.001
    },
    questionId: question.id,
    title: `Fråga ${index + 1}`
  };
});

/**
 * Skapar en cirkulär rutt för auto-genererade rundor utifrån längd och startpunkt.
 * Använder ruttplanering för att följa faktiska gångvägar.
 */
const createGeneratedCheckpoints = async (questions, { lengthMeters = 2500, origin, seed, preferGreenAreas }) => {
  const baseLat = origin?.lat ?? FALLBACK_POSITION.lat;
  const baseLng = origin?.lng ?? FALLBACK_POSITION.lng;

  try {
    // Använd ruttplaneringen för att få riktiga gångvägar
    const routeData = await generateWalkingRoute({
      origin: { lat: baseLat, lng: baseLng },
      lengthMeters,
      checkpointCount: questions.length,
      seed,
      preferGreenAreas
    });

    // Skapa checkpoints med frågor längs den planerade rutten
    const mappedCheckpoints = routeData.checkpoints.map((checkpoint, index) => ({
      order: checkpoint.order,
      location: checkpoint.location,
      questionId: questions[index].id,
      title: `Fråga ${index + 1}`,
      routeIndex: checkpoint.routeIndex
    }));

    // Returnera både checkpoints och rutt-data
    return {
      checkpoints: mappedCheckpoints,
      route: routeData.route,
      totalDistance: routeData.totalDistance
    };

  } catch (error) {
    console.warn('[RunFactory] Ruttplanering misslyckades, använder cirkulär fallback:', error);

    // Ge användaren specifik feedback om vad som gick fel
    const errorMessage = error.message?.includes('API')
      ? 'Kunde inte ansluta till karttjänsten. Använder förenklad rutt.'
      : error.message?.includes('network') || error.message?.includes('fetch')
      ? 'Nätverksfel - kontrollera din internetanslutning. Använder förenklad rutt.'
      : 'Kunde inte generera rutt med karttjänst. Använder förenklad rutt.';

    if (process.env.NODE_ENV !== 'production') {
      console.warn('[RunFactory] Felmeddelande till användare:', errorMessage);
    }

    // Fallback till den gamla cirkular-metoden
    const fallbackCheckpoints = questions.map((question, index) => {
      const angle = (index / questions.length) * Math.PI * 2;
      const spread = lengthMeters / 1000 / questions.length;
      const latOffset = Math.sin(angle) * spread * 0.01;
      const lngOffset = Math.cos(angle) * spread * 0.01;
      return {
        order: index + 1,
        location: {
          lat: baseLat + latOffset,
          lng: baseLng + lngOffset
        },
        questionId: question.id,
        title: `Fråga ${index + 1}`
      };
    });

    return {
      checkpoints: fallbackCheckpoints,
      route: null, // Ingen detaljerad rutt i fallback
      totalDistance: lengthMeters
    };
  }
};

/**
 * Fyller på metadata som skapats av admin så att run-objektet blir komplett.
 */
const stampBaseRun = (run, creator) => ({
  ...run,
  createdBy: creator?.id || 'admin',
  createdByName: creator?.name || 'Administratör',
  createdAt: new Date().toISOString(),
  status: 'active'
});

/**
 * Bygger en administratörsstyrd runda med checkpoints placerade längs rutten.
 */
export const buildHostedRun = async ({
  name,
  description,
  audience = 'family',
  difficulty = 'family',
  questionCount = 8,
  categories = [],
  type = 'hosted',
  lengthMeters = 2000,
  allowAnonymous = true,
  allowRouteSelection = false,
  language = 'sv',
  origin = null
}, creator) => {
  const questions = await pickQuestions({ audience, difficulty, questionCount, categories });
  const joinCode = generateJoinCode();

  // Först skapa rutten, sedan placera checkpoints längs den
  let route = null;
  let checkpoints = [];

  try {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[RunFactory] buildHostedRun: genererar route-data för hosted runda');
    }

    // Använd GPS-position från admin eller fallback till Kalmar
    const startOrigin = origin || FALLBACK_POSITION;
    const routeData = await generateWalkingRoute({
      origin: startOrigin,
      lengthMeters,
      checkpointCount: questions.length
    });

    if (routeData.route && routeData.route.length > 0) {
      route = routeData.route;

      // Placera checkpoints längs den faktiska rutten
      checkpoints = questions.map((question, index) => {
        const routeIndex = Math.floor((index / questions.length) * (route.length - 1));
        const safeIndex = Math.min(routeIndex, route.length - 1);

        return {
          order: index + 1,
          location: { ...route[safeIndex] },
          questionId: question.id,
          title: `Fråga ${index + 1}`,
          routeIndex: safeIndex
        };
      });

      if (process.env.NODE_ENV !== 'production') {
        console.debug('[RunFactory] buildHostedRun: checkpoints placerade längs rutten', {
          routePointCount: route.length,
          checkpointCount: checkpoints.length,
          checkpointPositions: checkpoints.map(cp => `${cp.order}: route[${cp.routeIndex}]`)
        });
      }
    } else {
      // Fallback om route-generering misslyckas
      const fallbackOrigin = origin || FALLBACK_POSITION;
      checkpoints = createHostedCheckpoints(questions, fallbackOrigin);
    }
  } catch (error) {
    console.warn('[RunFactory] buildHostedRun: kunde inte generera route-data:', error);

    // Ge mer specifik feedback
    const errorType = !origin
      ? 'GPS-position saknas'
      : error.message?.includes('API')
      ? 'Karttjänsten svarar inte'
      : 'Ruttgenereringen misslyckades';

    if (process.env.NODE_ENV !== 'production') {
      console.warn('[RunFactory] Feltyp:', errorType, '- Använder fallback-checkpoints');
    }

    // Fallback till gamla metoden
    const errorOrigin = origin || FALLBACK_POSITION;
    checkpoints = createHostedCheckpoints(questions, errorOrigin);
  }

  const run = {
    id: uuidv4(),
    name,
    description,
    audience,
    difficulty,
    questionCount,
    type,
    lengthMeters,
    allowAnonymous,
    allowRouteSelection,
    language: language || 'sv',
    joinCode,
    qrSlug: joinCode.toLowerCase(),
    checkpoints,
    route,
    startPoint: origin || FALLBACK_POSITION, // Spara startpunkten
    questionIds: questions.map((question) => question.id)
  };

  return stampBaseRun(run, creator);
};

/**
 * Bygger en auto-genererad runda inklusive slumpad joinCode och kartpunkter.
 */
export const buildGeneratedRun = async ({
  name,
  audience = 'family',
  difficulty = 'family',
  lengthMeters = 2500,
  questionCount = 8,
  categories = [],
  allowAnonymous = true,
  allowRouteSelection = false,
  language = 'sv',
  origin,
  seed,
  preferGreenAreas
}, creator) => {
  const questions = await pickQuestions({ audience, difficulty, questionCount, categories });
  const joinCode = generateJoinCode();
  const checkpointData = await createGeneratedCheckpoints(questions, { lengthMeters, origin, seed, preferGreenAreas });

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RunFactory] checkpointData från createGeneratedCheckpoints:', {
      hasCheckpoints: !!checkpointData.checkpoints,
      checkpointCount: checkpointData.checkpoints?.length || 0,
      hasRoute: !!checkpointData.route,
      routePointCount: checkpointData.route?.length || 0,
      totalDistance: checkpointData.totalDistance
    });
  }

  const run = {
    id: uuidv4(),
    name: name || 'Ny runda',
    description: 'Genererad utifrån önskemål',
    audience,
    difficulty,
    questionCount,
    type: 'generated',
    lengthMeters,
    allowAnonymous,
    allowRouteSelection,
    language: language || 'sv',
    joinCode,
    qrSlug: joinCode.toLowerCase(),
    checkpoints: checkpointData.checkpoints,
    route: checkpointData.route, // Spara den faktiska rutten om tillgänglig
    startPoint: origin || FALLBACK_POSITION, // Spara startpunkten
    questionIds: questions.map((question) => question.id)
  };

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RunFactory] Skapad run:', {
      id: run.id,
      hasCheckpoints: !!run.checkpoints,
      checkpointCount: run.checkpoints?.length || 0,
      hasRoute: !!run.route,
      routePointCount: run.route?.length || 0
    });
  }

  return stampBaseRun(run, creator || { id: name || 'Auto', name: name || 'Auto-generator' });
};

/**
 * Bygger en distans-baserad runda där frågor triggas baserat på GPS-avstånd.
 * Ingen förutbestämd rutt - spelaren går fritt och får frågor när de gått X meter.
 */
export const buildDistanceBasedRun = async ({
  name,
  audience = 'family',
  difficulty = 'family',
  distanceBetweenQuestions = 500, // meter mellan varje fråga
  questionCount = 8,
  categories = [],
  allowAnonymous = true,
  language = 'sv'
}, creator) => {
  const questions = await pickQuestions({ audience, difficulty, questionCount, categories });
  const joinCode = generateJoinCode();

  const run = {
    id: uuidv4(),
    name: name || 'Distansbaserad runda',
    description: 'Gå fritt - frågor triggas automatiskt var X:e meter',
    audience,
    difficulty,
    questionCount,
    type: 'distance-based', // Ny rundtyp
    distanceBetweenQuestions, // Meter mellan frågor istället för lengthMeters
    allowAnonymous,
    allowRouteSelection: false, // Ingen rutt att välja
    language: language || 'sv',
    joinCode,
    qrSlug: joinCode.toLowerCase(),
    checkpoints: [], // Tom - inga förutbestämda checkpoints
    route: null, // Ingen förutbestämd rutt
    startPoint: null, // Startar där spelaren är
    questionIds: questions.map((question) => question.id)
  };

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RunFactory] Skapad distance-based run:', {
      id: run.id,
      distanceBetweenQuestions: run.distanceBetweenQuestions,
      questionCount: run.questionCount
    });
  }

  return stampBaseRun(run, creator || { id: name || 'Auto', name: name || 'Auto-generator' });
};

/**
 * Bygger en tidsbaserad runda där frågor triggas efter X minuter.
 * Ingen förutbestämd rutt – fokus ligger på tidsintervall mellan frågor.
 */
export const buildTimeBasedRun = async ({
  name,
  audience = 'family',
  difficulty = 'family',
  minutesBetweenQuestions = 5,
  questionCount = 8,
  categories = [],
  allowAnonymous = true,
  language = 'sv'
}, creator) => {
  const questions = await pickQuestions({ audience, difficulty, questionCount, categories });
  const joinCode = generateJoinCode();

  const run = {
    id: uuidv4(),
    name: name || 'Tidsbaserad runda',
    description: 'Frågor släpps automatiskt efter angivet tidsintervall.',
    audience,
    difficulty,
    questionCount,
    type: 'time-based',
    minutesBetweenQuestions,
    allowAnonymous,
    allowRouteSelection: false,
    language: language || 'sv',
    joinCode,
    qrSlug: joinCode.toLowerCase(),
    checkpoints: [],
    route: null,
    startPoint: null,
    questionIds: questions.map((question) => question.id)
  };

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RunFactory] Skapad time-based run:', {
      id: run.id,
      minutesBetweenQuestions: run.minutesBetweenQuestions,
      questionCount: run.questionCount
    });
  }

  return stampBaseRun(run, creator || { id: name || 'Auto', name: name || 'Auto-generator' });
};
