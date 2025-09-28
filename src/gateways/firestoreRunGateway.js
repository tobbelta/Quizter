/**
 * Pratar med Firestore-versionen av runRepository och speglar samma API som runService.
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
  where
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebaseClient';
import { buildHostedRun, buildGeneratedRun } from '../services/runFactory';
import { PARTICIPANT_TIMEOUT_MS } from '../services/runService';

const db = getFirebaseDb();

const runsCollection = collection(db, 'runs');
const participantsCollection = (runId) => collection(db, 'runs', runId, 'participants');

/** Gör en enkel deep clone innan data skickas till Firestore. */
const serialize = (payload) => JSON.parse(JSON.stringify(payload));

/** Plockar ut run-data från ett Firestore-dokument. */
const mapRunDoc = (docSnap) => {
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() };
};

/** Räknar ut aktiv/status för en deltagare precis som i localStorage-varianten. */
const enrichParticipant = (participant) => {
  const now = Date.now();
  const lastSeenMs = participant.lastSeen ? new Date(participant.lastSeen).getTime() : 0;
  const completedAtMs = participant.completedAt ? new Date(participant.completedAt).getTime() : null;
  const isFinished = Boolean(completedAtMs);
  const isActive = !isFinished && now - lastSeenMs < PARTICIPANT_TIMEOUT_MS;
  const status = isFinished ? 'finished' : (isActive ? 'active' : 'inactive');
  return { ...participant, isActive, status };
};

/** Översätter ett deltagardokument och berikar det med status. */
const mapParticipantDoc = (docSnap) => {
  if (!docSnap.exists()) return null;
  return enrichParticipant({ id: docSnap.id, ...docSnap.data() });
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
    return mapRunDoc(docSnap);
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
    const run = buildHostedRun(payload, creator);
    await setDoc(doc(runsCollection, run.id), serialize(run));
    return run;
  },

  /** Sparar en auto-genererad runda. */
  async generateRouteRun(payload, creator) {
    const run = buildGeneratedRun(payload, creator);
    await setDoc(doc(runsCollection, run.id), serialize(run));
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
  }
};

export default firestoreRunGateway;




