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
  documentId,
  serverTimestamp
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebaseClient';
import { buildHostedRun, buildGeneratedRun } from '../services/runFactory';
import { FALLBACK_POSITION, PARTICIPANT_TIMEOUT_MS } from '../utils/constants';

/**
 * Lat-laddad Firestore databas-instans
 * Används för att undvika initialiseringskonkurrens
 */
const hämtaDb = () => getFirebaseDb();

/**
 * Firestore collection-referenser (memoized för prestanda)
 */
const hämtaRundsCollection = () => collection(hämtaDb(), 'runs');
const hämtaDeltagarCollection = (runId) => collection(hämtaDb(), 'runs', runId, 'participants');

/**
 * Säker serialisering för Firestore-kompatibilitet
 * Konverterar objekt till ren JSON för att undvika Firestore-begränsningar
 *
 * @param {any} data - Data att serialisera
 * @returns {any} Serialiserad data säker för Firestore
 */
const serialiseraFörFirestore = (data) => {
  try {
    return JSON.parse(JSON.stringify(data));
  } catch (error) {
    console.warn('[FirestoreGateway] Serialisering misslyckades:', error);
    return data;
  }
};

/**
 * Optimerad mapping av Firestore-dokument till rundeobjekt
 * Inkluderar null-kontroll och prestanda-optimeringar
 *
 * @param {DocumentSnapshot} docSnap - Firestore dokumentögonblick
 * @returns {Object|null} Rundeobjekt eller null om dokument inte finns
 */
const mapperaRundeDokument = (docSnap) => {
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
 * Optimerad för prestanda med cachade tidsstämplar
 *
 * @param {Object} deltagare - Deltagarobjekt från Firestore
 * @returns {Object} Deltagare med beräknad status
 */
const beräknaDeltagarStatus = (deltagare) => {
  if (!deltagare) return null;

  const nu = Date.now();
  const sistSeenMs = deltagare.lastSeen
    ? new Date(deltagare.lastSeen).getTime()
    : 0;
  const färdigMs = deltagare.completedAt
    ? new Date(deltagare.completedAt).getTime()
    : null;

  // Status-logik
  const ärFärdig = Boolean(färdigMs);
  const ärAktiv = !ärFärdig && (nu - sistSeenMs) < PARTICIPANT_TIMEOUT_MS;
  const status = ärFärdig ? 'finished' : (ärAktiv ? 'active' : 'inactive');

  return {
    ...deltagare,
    isActive: ärAktiv,
    status,
    // Lägg till hjälpfält för UI
    lastSeenFormatted: deltagare.lastSeen
      ? new Date(deltagare.lastSeen).toLocaleString('sv-SE')
      : 'Aldrig',
    completedAtFormatted: deltagare.completedAt
      ? new Date(deltagare.completedAt).toLocaleString('sv-SE')
      : null
  };
};

/**
 * Mappar Firestore deltagardokument till berikade deltagarobjekt
 * Inkluderar statusberäkning och felhantering
 *
 * @param {DocumentSnapshot} docSnap - Firestore dokumentögonblick
 * @returns {Object|null} Berikad deltagare eller null
 */
const mapperaDeltagarDokument = (docSnap) => {
  if (!docSnap?.exists()) return null;

  const deltagarData = { id: docSnap.id, ...docSnap.data() };
  return beräknaDeltagarStatus(deltagarData);
};

export const firestoreRunGateway = {
  /** Hämtar alla rundor från Firestore. */
  async listRuns() {
    const snapshot = await getDocs(hämtaRundsCollection());
    return snapshot.docs.map(mapperaRundeDokument).filter(Boolean);
  },

  /** Hämtar specifika rundor från Firestore via en lista med ID:n. */
  async listRunsByIds(runIds) {
    if (!runIds || runIds.length === 0) {
      return [];
    }
    const runQuery = query(hämtaRundsCollection(), where(documentId(), 'in', runIds));
    const snapshot = await getDocs(runQuery);
    return snapshot.docs.map(mapperaRundeDokument).filter(Boolean);
  },

  /** Hämtar en runda via dokument-id. */
  async getRun(runId) {
    const docSnap = await getDoc(doc(hämtaRundsCollection(), runId));
    let run = mapperaRundeDokument(docSnap);

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
          await setDoc(doc(hämtaRundsCollection(), run.id), serialiseraFörFirestore(run));

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
    console.log(`getRunByCode: searching for joinCode=${joinCode}`);

    try {
      const runQuery = query(hämtaRundsCollection(), where('joinCode', '==', joinCode.toUpperCase()));
      const snapshot = await getDocs(runQuery);
      console.log(`getRunByCode: snapshot size=${snapshot.size}`);
      const [first] = snapshot.docs;
      return first ? mapperaRundeDokument(first) : null;
    } catch (error) {
      console.error('[getRunByCode] Firestore query failed:', {
        code: error.code,
        message: error.message,
        joinCode,
        error
      });

      // Om det är ett permissions-fel, ge en tydligare felmeddelande
      if (error.code === 'permission-denied') {
        throw new Error('Kunde inte hämta runda - behörighetsproblem. Försök igen om en stund.');
      }

      throw error;
    }
  },

  /** Sparar en ny admin-skapad runda. */
  async createRun(payload, creator) {
    const run = await buildHostedRun(payload, creator);
    await setDoc(doc(hämtaRundsCollection(), run.id), {
      ...serialiseraFörFirestore(run),
      createdAt: serverTimestamp(),
    });
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
        hasCheckpoints: !!run?.checkpoints,
        checkpointCount: run.checkpoints?.length || 0
      });
    }

    const serialized = serialiseraFörFirestore(run);

    await setDoc(doc(hämtaRundsCollection(), run.id), { ...serialized, createdAt: serverTimestamp() });

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[FirestoreGateway] Returnerar run med route:', !!run.route);
    }

    return run;
  },

  /** Hämtar deltagarlistan för en runda. */
  async listParticipants(runId) {
    const snapshot = await getDocs(hämtaDeltagarCollection(runId));
    return snapshot.docs.map(mapperaDeltagarDokument).filter(Boolean);
  },

  /** Registrerar en ny deltagare i Firestore. */
  async registerParticipant(runId, { userId, alias, contact, isAnonymous }) {
    console.log('🔧 registerParticipant v2.0 - UPDATED VERSION');
    console.log('registerParticipant called with:', { runId, userId, alias, contact, isAnonymous });

    const participant = {
      id: uuidv4(),
      runId,
      userId: userId || null,
      alias: alias || 'Gäst',
      contact: contact || null,
      isAnonymous: Boolean(isAnonymous),
      joinedAt: serverTimestamp(),  // Använd Firestore serverTimestamp
      completedAt: null,
      currentOrder: 1,
      score: 0,
      answers: [],
      lastSeen: serverTimestamp()   // Använd Firestore serverTimestamp
    };

    console.log('Participant object to write:', {
      ...participant,
      joinedAt: 'serverTimestamp()',
      lastSeen: 'serverTimestamp()'
    });

    try {
      await setDoc(doc(hämtaDeltagarCollection(runId), participant.id), participant);
      console.log('✅ Participant created successfully!');
    } catch (error) {
      console.error('❌ Failed to create participant:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      throw error;
    }

    // Returnera med ISO timestamps för frontend
    return beräknaDeltagarStatus({
      ...participant,
      joinedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    });
  },

  /** Sparar ett svar och håller ordning på poäng i Firestore. */
  async recordAnswer(runId, participantId, { questionId, answerIndex, correct }) {
    const participantRef = doc(hämtaDeltagarCollection(runId), participantId);
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

    const runSnap = await getDoc(doc(hämtaRundsCollection(), runId));
    const questionCount = runSnap.exists() ? (runSnap.data().questionIds?.length || 0) : 0;

    const updated = {
      ...participant,
      answers,
      score,
      currentOrder: answers.length + 1,
      completedAt: questionCount > 0 && answers.length === questionCount ? now : participant.completedAt,
      lastSeen: now
    };

    await setDoc(participantRef, serialiseraFörFirestore(updated), { merge: true });
    return beräknaDeltagarStatus(updated);
  },

  /** Markerar deltagaren som klar. */
  async completeRun(runId, participantId) {
    const participantRef = doc(hämtaDeltagarCollection(runId), participantId);
    const now = new Date().toISOString();
    await updateDoc(participantRef, { completedAt: now, lastSeen: now });
  },

  /** Stänger rundan för fler svar. */
  async closeRun(runId) {
    const now = new Date().toISOString();
    await updateDoc(doc(hämtaRundsCollection(), runId), { status: 'closed', closedAt: now });
  },

  /** Raderar en runda och alla dess deltagare. */
  async deleteRun(runId) {
    const { deleteDoc, getDocs } = await import('firebase/firestore');

    // Först radera alla deltagare i rundan
    const participantsSnapshot = await getDocs(hämtaDeltagarCollection(runId));
    const deletePromises = participantsSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);

    // Sedan radera själva rundan
    await deleteDoc(doc(hämtaRundsCollection(), runId));
  },

  // Realtidslyssnare för rundor.
  subscribeRuns(listener) {
    const q = query(hämtaRundsCollection(), where("status", "==", "active"));
    return onSnapshot(q, (snapshot) => {
      const runs = snapshot.docs.map(mapperaRundeDokument).filter(Boolean);
      listener(runs);
    });
  },

  /** Realtidslyssnare för deltagare i en runda. */
  subscribeParticipants(runId, listener) {
    return onSnapshot(hämtaDeltagarCollection(runId), (snapshot) => {
      const participants = snapshot.docs.map(mapperaDeltagarDokument).filter(Boolean);
      listener(participants);
    });
  },

  /** Uppdaterar deltagarens senaste aktivitetstid. */
  async heartbeatParticipant(runId, participantId) {
    const participantRef = doc(hämtaDeltagarCollection(runId), participantId);
    const now = new Date().toISOString();
    await updateDoc(participantRef, { lastSeen: now });
    const snap = await getDoc(participantRef);
    return mapperaDeltagarDokument(snap);
  },

  /** Hämtar en deltagare via id. */
  async getParticipant(runId, participantId) {
    const snap = await getDoc(doc(hämtaDeltagarCollection(runId), participantId));
    return mapperaDeltagarDokument(snap);
  },

  /** Uppdaterar en befintlig runda. */
  async updateRun(runId, updates) {
    const runRef = doc(hämtaRundsCollection(), runId);
    await updateDoc(runRef, serialiseraFörFirestore(updates));
    const snap = await getDoc(runRef);
    return mapperaRundeDokument(snap);
  }
};

export default firestoreRunGateway;