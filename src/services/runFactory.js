/**
 * Fabriksfunktioner som bygger run-objekt och deras checkpoints baserat på önskat scenario.
 */
import { v4 as uuidv4 } from 'uuid';
import { QUESTION_BANK } from '../data/questions';
import { questionService } from './questionService';
import { generateWalkingRoute } from './routeService';
import { FALLBACK_POSITION } from '../utils/constants';

/**
 * Skapar en slumpad anslutningskod utan lättförväxlade tecken.
 */
const generateJoinCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

/**
 * Hämtar frågebanken från questionService och faller tillbaka till den bundlade listan.
 */
const resolveQuestionPool = () => {
  try {
    return questionService.listAll();
  } catch (error) {
    return QUESTION_BANK;
  }
};

/**
 * Filtrerar och väljer ut rätt antal frågor baserat på målgrupp och svårighet.
 */
const pickQuestions = ({ audience, difficulty, questionCount }) => {
  const pool = resolveQuestionPool();
  const filtered = pool.filter((question) => {
    if (audience === 'family') {
      return question.audience === 'family' || question.audience === 'kid';
    }
    if (audience === 'kid') {
      return question.audience === 'kid';
    }
    return question.audience === 'adult' || question.difficulty === difficulty;
  });

  const shuffled = [...filtered].sort(() => Math.random() - 0.5);
  if (shuffled.length < questionCount) {
    throw new Error('Frågebanken innehåller inte tillräckligt många frågor för vald profil.');
  }
  return shuffled.slice(0, questionCount);
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
const createGeneratedCheckpoints = async (questions, { lengthMeters = 2500, origin }) => {
  const baseLat = origin?.lat ?? FALLBACK_POSITION.lat;
  const baseLng = origin?.lng ?? FALLBACK_POSITION.lng;

  try {
    // Använd ruttplaneringen för att få riktiga gångvägar
    const routeData = await generateWalkingRoute({
      origin: { lat: baseLat, lng: baseLng },
      lengthMeters,
      checkpointCount: questions.length
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
  type = 'hosted',
  lengthMeters = 2000,
  allowAnonymous = true,
  origin = null
}, creator) => {
  const questions = pickQuestions({ audience, difficulty, questionCount });
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
    joinCode,
    qrSlug: joinCode.toLowerCase(),
    checkpoints,
    route,
    questionIds: questions.map((question) => question.id)
  };

  return stampBaseRun(run, creator);
};

/**
 * Bygger en auto-genererad runda inklusive slumpad joinCode och kartpunkter.
 */
export const buildGeneratedRun = async ({
  alias,
  audience = 'family',
  difficulty = 'family',
  lengthMeters = 2500,
  questionCount = 8,
  allowAnonymous = true,
  origin
}, creator) => {
  const questions = pickQuestions({ audience, difficulty, questionCount });
  const joinCode = generateJoinCode();
  const checkpointData = await createGeneratedCheckpoints(questions, { lengthMeters, origin });

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
    name: `Auto-runda av ${alias || 'okänd skapare'}`,
    description: 'Genererad utifrån önskemål',
    audience,
    difficulty,
    questionCount,
    type: 'generated',
    lengthMeters,
    allowAnonymous,
    joinCode,
    qrSlug: joinCode.toLowerCase(),
    checkpoints: checkpointData.checkpoints,
    route: checkpointData.route, // Spara den faktiska rutten om tillgänglig
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

  return stampBaseRun(run, creator || { id: alias || 'Auto', name: alias || 'Auto-generator' });
};
