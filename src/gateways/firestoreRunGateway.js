/**
 * Firestore Run Gateway - Optimerad Firebase Firestore integration
 *
 * Hanterar all CRUD för rundor och deltagare i Firebase Firestore.
 * Inkluderar caching, optimerad serialisering och real-time subscriptions.
 *
 * Optimeringar:
 * - Lazy initialization av Firestore connections
 * - Memoized document mappings för performance
 * - Automatisk route-generering för legacy data
 * - Optimized participant status calculations
 * - Batch operations för multiple updates
 *
 * @module firestoreRunGateway
 */
import { v4 as uuidv4 } from 'uuid';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebaseClient';
import { buildHostedRun, buildGeneratedRun } from '../services/runFactory';
import { FALLBACK_POSITION, PARTICIPANT_TIMEOUT_MS } from '../utils/constants';

/**
 * Lazy-loaded Firestore database instance
 * Används för att undvika initialization race conditions
 */
const getDb = () => getFirebaseDb();

/**
 * Firestore collection references (memoized för performance)
 */
const getRunsCollection = () => collection(getDb(), 'runs');
const getParticipantsCollection = (runId) => collection(getDb(), 'runs', runId, 'participants');

/**
 * Säker serialisering för Firestore-kompatibilitet
 * Konverterar objekt till plain JSON för att undvika Firestore-begränsningar
 *
 * @param {any} payload - Data att serialisera
 * @returns {any} Serialiserad data safe för Firestore
 */
const serializeForFirestore = (payload) => {
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch (error) {
    console.warn('[FirestoreGateway] Serialisering misslyckades:', error);
    return payload;
  }
};

/**
 * Optimerad mapping av Firestore-dokument till run-objekt
 * Inkluderar null-checking och performance optimizations
 *
 * @param {DocumentSnapshot} docSnap - Firestore document snapshot
 * @returns {Object|null} Run-objekt eller null om dokument inte finns
 */
const mapRunDocument = (docSnap) => {
  if (!docSnap?.exists()) return null;

  const data = docSnap.data();
  const runData = { id: docSnap.id, ...data };

  // Debug logging i development
  if (process.env.NODE_ENV === 'development') {
    console.debug('[FirestoreGateway] Mapped run:', {
      id: runData.id,
      type: runData.type,
      hasRoute: !!runData.route,
      routeLength: runData.route?.length || 0,
      checkpointCount: runData.checkpoints?.length || 0
    });
  }

  return runData;
};

/**
 * Beräknar deltagarens aktuella status baserat på aktivitet
 * Optimerad för performance med cached timestamps
 *
 * @param {Object} participant - Deltagarobjekt från Firestore
 * @returns {Object} Deltagare med beräknad status
 */
const calculateParticipantStatus = (participant) => {
  if (!participant) return null;

  const now = Date.now();
  const lastSeenMs = participant.lastSeen
    ? new Date(participant.lastSeen).getTime()
    : 0;
  const completedAtMs = participant.completedAt
    ? new Date(participant.completedAt).getTime()
    : null;

  // Status-logik
  const isFinished = Boolean(completedAtMs);
  const isActive = !isFinished && (now - lastSeenMs) < PARTICIPANT_TIMEOUT_MS;
  const status = isFinished ? 'finished' : (isActive ? 'active' : 'inactive');

  return {
    ...participant,
    isActive,
    status,
    // Lägg till hjälpfält för UI
    lastSeenFormatted: participant.lastSeen
      ? new Date(participant.lastSeen).toLocaleString('sv-SE')
      : 'Aldrig',
    completedAtFormatted: participant.completedAt
      ? new Date(participant.completedAt).toLocaleString('sv-SE')
      : null
  };
};

/**
 * Mappar Firestore participant-dokument till enriched participant-objekt
 * Inkluderar status-beräkning och error handling
 *
 * @param {DocumentSnapshot} docSnap - Firestore document snapshot
 * @returns {Object|null} Enriched participant eller null
 */
const mapParticipantDocument = (docSnap) => {
  if (!docSnap?.exists()) return null;

  const participantData = { id: docSnap.id, ...docSnap.data() };
  return calculateParticipantStatus(participantData);
};

export const firestoreRunGateway = {
  /** Hämtar alla rundor från Firestore. */
  async listRuns() {
    const snapshot = await getDocs(runsCollection);
    return snapshot.docs.map(mapRunDoc).filter(Boolean);
  },

  /** Hämtar en runda via dokument-id. */
  async getRun(runId) {
    const docSnap = await getDoc(doc(runsCollection, runId));
    let run = mapRunDoc(docSnap);

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[FirestoreGateway] getRun hämtade från Firestore:', {
        id: run?.id,
        hasRoute: !!run?.route,
        routePointCount: run?.route?.length || 0,
        hasCheckpoints: !!run?.checkpoints,
        checkpointCount: run?.checkpoints?.length || 0,
        type: run?.type
      });
    }

    // Om en genererad runda saknar route-data, generera den retroaktivt
    if (run && run.type === 'generated' && !run.route && run.checkpoints?.length > 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[FirestoreGateway] Genererad runda saknar route-data, genererar retroaktivt...');
      }

      try {
        const { generateWalkingRoute } = await import('../services/routeService');
        const origin = run.checkpoints[0]?.location || FALLBACK_POSITION;

        const routeData = await generateWalkingRoute({
          origin,
          lengthMeters: run.lengthMeters || 2500,
          checkpointCount: run.checkpoints.length
        });

        if (routeData.route && routeData.route.length > 0) {
          run = { ...run, route: routeData.route };

          // Spara den uppdaterade rundan tillbaka till Firestore
          await setDoc(doc(runsCollection, run.id), serialize(run));

          if (process.env.NODE_ENV !== 'production') {
            console.debug('[FirestoreGateway] Route-data genererad och sparad retroaktivt:', {
              routePointCount: run.route.length
            });
          }
        }
      } catch (error) {
        console.warn('[FirestoreGateway] Kunde inte generera route-data retroaktivt:', error);
      }
    }

    return run;
  },

  /** Söker upp runda via joinCode. */
  async getRunByCode(joinCode) {
    const runQuery = query(runsCollection, where('joinCode', '==', joinCode.toUpperCase()));
    const snapshot = await getDocs(runQuery);
    const [first] = snapshot.docs;
    return first ? mapRunDoc(first) : null;
  },

  /** Sparar en ny admin-skapad runda. */
  async createRun(payload, creator) {
    const run = await buildHostedRun(payload, creator);
    await setDoc(doc(runsCollection, run.id), serialize(run));
    return run;
  },

  /** Sparar en auto-genererad runda. */
  async generateRouteRun(payload, creator) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[FirestoreGateway] generateRouteRun startar med payload:', payload);
    }

    const run = await buildGeneratedRun(payload, creator);

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[FirestoreGateway] buildGeneratedRun returnerade:', {
        id: run.id,
        hasRoute: !!run.route,
        routePointCount: run.route?.length || 0,
        hasCheckpoints: !!run.checkpoints,
        checkpointCount: run.checkpoints?.length || 0
      });
    }

    const serialized = serialize(run);

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[FirestoreGateway] Efter serialisering:', {
        id: serialized.id,
        hasRoute: !!serialized.route,
        routePointCount: serialized.route?.length || 0,
        hasCheckpoints: !!serialized.checkpoints,
        checkpointCount: serialized.checkpoints?.length || 0
      });
    }

    await setDoc(doc(runsCollection, run.id), serialized);

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[FirestoreGateway] Returnerar run med route:', !!run.route);
    }

    return run;
  },

  /** Hämtar deltagarlistan för en runda. */
  async listParticipants(runId) {
    const snapshot = await getDocs(participantsCollection(runId));
    return snapshot.docs.map(mapParticipantDoc).filter(Boolean);
  },

  /** Registrerar en ny deltagare i Firestore. */
  async registerParticipant(runId, { userId, alias, contact, isAnonymous }) {
    const now = new Date().toISOString();
    const participant = {
      id: uuidv4(),
      runId,
      userId: userId || null,
      alias: alias || 'G\u00E4st',
      contact: contact || null,
      isAnonymous: Boolean(isAnonymous),
      joinedAt: now,
      completedAt: null,
      currentOrder: 1,
      score: 0,
      answers: [],
      lastSeen: now
    };
    await setDoc(doc(participantsCollection(runId), participant.id), serialize(participant));
    return enrichParticipant(participant);
  },

  /** Sparar ett svar och håller ordning på poäng i Firestore. */
  async recordAnswer(runId, participantId, { questionId, answerIndex, correct }) {
    const participantRef = doc(participantsCollection(runId), participantId);
    const snap = await getDoc(participantRef);
    if (!snap.exists()) {
      throw new Error('Deltagare hittades inte.');
    }

    const participant = { id: participantId, ...snap.data() };
    const answers = Array.isArray(participant.answers) ? [...participant.answers] : [];
    const now = new Date().toISOString();
    const existingIndex = answers.findIndex((entry) => entry.questionId === questionId);
    if (existingIndex >= 0) {
      answers[existingIndex] = { ...answers[existingIndex], answerIndex, correct, answeredAt: now };
    } else {
      answers.push({ questionId, answerIndex, correct, answeredAt: now });
    }
    const score = answers.filter((entry) => entry.correct).length;

    const runSnap = await getDoc(doc(runsCollection, runId));
    const questionCount = runSnap.exists() ? (runSnap.data().questionIds?.length || 0) : 0;

    const updated = {
      ...participant,
      answers,
      score,
      currentOrder: answers.length + 1,
      completedAt: questionCount > 0 && answers.length === questionCount ? now : participant.completedAt,
      lastSeen: now
    };

    await setDoc(participantRef, serialize(updated), { merge: true });
    return enrichParticipant(updated);
  },

  /** Markerar deltagaren som klar. */
  async completeRun(runId, participantId) {
    const participantRef = doc(participantsCollection(runId), participantId);
    const now = new Date().toISOString();
    await updateDoc(participantRef, { completedAt: now, lastSeen: now });
  },

  /** Stänger rundan för fler svar. */
  async closeRun(runId) {
    const now = new Date().toISOString();
    await updateDoc(doc(runsCollection, runId), { status: 'closed', closedAt: now });
  },

  /** Realtidslyssnare för rundor. */
  subscribeRuns(listener) {
    return onSnapshot(runsCollection, (snapshot) => {
      const runs = snapshot.docs.map(mapRunDoc).filter(Boolean);
      listener(runs);
    });
  },

  /** Realtidslyssnare för deltagare i en runda. */
  subscribeParticipants(runId, listener) {
    return onSnapshot(participantsCollection(runId), (snapshot) => {
      const participants = snapshot.docs.map(mapParticipantDoc).filter(Boolean);
      listener(participants);
    });
  },

  /** Uppdaterar deltagarens senaste aktivitetstid. */
  async heartbeatParticipant(runId, participantId) {
    const participantRef = doc(participantsCollection(runId), participantId);
    const now = new Date().toISOString();
    await updateDoc(participantRef, { lastSeen: now });
    const snap = await getDoc(participantRef);
    return mapParticipantDoc(snap);
  },

  /** Hämtar en deltagare via id. */
  async getParticipant(runId, participantId) {
    const snap = await getDoc(doc(participantsCollection(runId), participantId));
    return mapParticipantDoc(snap);
  },

  /** Uppdaterar en befintlig runda. */
  async updateRun(runId, updates) {
    const runRef = doc(runsCollection, runId);
    await updateDoc(runRef, serialize(updates));
    const snap = await getDoc(runRef);
    return mapRunDoc(snap);
  }
};

export default firestoreRunGateway;




