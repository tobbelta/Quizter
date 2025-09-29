/**
 * Väljer mellan lokal runService och Firestore-gateway beroende på miljö.
 */
import { runService } from '../services/runService';
import { hasFirebaseConfig } from '../firebaseClient';
import firestoreRunGateway from '../gateways/firestoreRunGateway';

/**
 * Gör om våra synkrona runService-metoder till async-kontrakt så att gränssnittet matchar Firestore.
 */
const wrapSync = (fn) => async (...args) => fn(...args);

/**
 * Bygger ett repository som bara pratar med localStorage-varianten av runService.
 */
const createLocalRepository = () => ({
  listRuns: wrapSync(runService.listRuns),
  getRun: wrapSync(runService.getRun),
  getRunByCode: wrapSync(runService.getRunByCode),
  createRun: runService.createRun, // Nu async
  generateRouteRun: wrapSync(runService.generateRouteRun),
  updateRun: wrapSync(runService.updateRun || (() => { throw new Error('updateRun inte implementerad för lokal service'); })),
  listParticipants: wrapSync(runService.listParticipants),
  registerParticipant: wrapSync(runService.registerParticipant),
  recordAnswer: wrapSync(runService.recordAnswer),
  completeRun: wrapSync(runService.completeRun),
  closeRun: wrapSync(runService.closeRun),
  heartbeatParticipant: wrapSync(runService.heartbeatParticipant),
  getParticipant: wrapSync(runService.getParticipant),
  subscribeRuns: runService.subscribeRuns,
  subscribeParticipants: runService.subscribeParticipants
});

/**
 * Om Firebase-variabler finns väljer vi molnbackenden, annars kör vi lokalt.
 */
const repository = hasFirebaseConfig() ? firestoreRunGateway : createLocalRepository();

export const runRepository = repository;
export const isFirestoreEnabled = hasFirebaseConfig();

export default runRepository;
