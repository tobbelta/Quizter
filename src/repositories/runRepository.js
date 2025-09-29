/**
 * Firebase Firestore repository för alla run-operationer.
 */
import { hasFirebaseConfig } from '../firebaseClient';
import firestoreRunGateway from '../gateways/firestoreRunGateway';

/**
 * Kontrollerar att Firebase är konfigurerat korrekt.
 */
if (!hasFirebaseConfig()) {
  throw new Error('Firebase måste vara konfigurerat. Kontrollera att alla REACT_APP_FIREBASE_* variabler är satta i .env');
}

/**
 * Använder alltid Firebase Firestore för data-operationer.
 */
export const runRepository = firestoreRunGateway;
export const isFirestoreEnabled = true;

export default runRepository;
