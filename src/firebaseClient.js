/**
 * Firebase Client - Centraliserad Firebase-initialisering och konfiguration
 *
 * Hanterar Firebase app-instans som singleton och säkerställer korrekt konfiguration
 * från miljövariabler. Alla Firebase-tjänster (Firestore, Auth) skapas via denna modul.
 *
 * @module firebaseClient
 */
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

/**
 * Firebase-konfiguration från miljövariabler
 * Läser alla REACT_APP_FIREBASE_* variabler från .env-filen
 */
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

/**
 * Minimala krav för Firebase-konfiguration
 * Dessa fyra fält krävs för att Firebase ska fungera korrekt
 */
const REQUIRED_CONFIG_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];

/**
 * Kontrollerar om alla nödvändiga Firebase-konfigurationer är satta
 * @returns {boolean} True om alla obligatoriska fält finns och är icke-tomma strängar
 */
const isFirebaseConfigured = REQUIRED_CONFIG_KEYS.every((key) => {
  const value = firebaseConfig[key];
  return typeof value === 'string' && value.trim().length > 0;
});

/**
 * Singleton Firebase app-instans
 * Cachar app-instansen för att undvika multiple initializations
 */
let appInstance = null;
let firestoreInstance = null;
let authInstance = null;

/**
 * Säkerställer att Firebase app är initialiserad och konfigurerad korrekt
 * Implementerar singleton-pattern för att återanvända samma instans
 *
 * @returns {FirebaseApp} Konfigurerad Firebase app-instans
 * @throws {Error} Om Firebase-konfiguration saknas eller är felaktig
 */
const ensureFirebaseApp = () => {
  // Kontrollera konfiguration först
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase är inte konfigurerat. Kontrollera att följande miljövariabler är satta i .env:\n' +
      REQUIRED_CONFIG_KEYS.map(key => `REACT_APP_FIREBASE_${key.toUpperCase()}`).join('\n')
    );
  }

  // Återanvänd befintlig instans om den finns
  if (appInstance) {
    return appInstance;
  }

  // Kontrollera om Firebase redan är initialiserat (t.ex. av annan del av appen)
  const existingApps = getApps();
  if (existingApps.length > 0) {
    appInstance = existingApps[0];
    return appInstance;
  }

  // Initialisera ny Firebase app
  try {
    appInstance = initializeApp(firebaseConfig);

    // Development-mode: Anslut till emulatorer om de körs
    if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_FIREBASE_EMULATOR === 'true') {
      console.log('🔧 Ansluter till Firebase emulatorer...');
      // Emulator-anslutning kan läggas till här vid behov
    }

    return appInstance;
  } catch (error) {
    throw new Error(`Kunde inte initialisera Firebase: ${error.message}`);
  }
};

/**
 * Hämtar Firebase Firestore-instans med lazy loading
 * Skapar och cachar Firestore-instansen första gången den efterfrågas
 *
 * @returns {Firestore} Konfigurerad Firestore-instans
 */
const getFirebaseDb = () => {
  if (!firestoreInstance) {
    const app = ensureFirebaseApp();
    firestoreInstance = getFirestore(app);

    // Development-mode: Anslut till Firestore emulator om konfigurerat
    if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_FIRESTORE_EMULATOR === 'true') {
      try {
        connectFirestoreEmulator(firestoreInstance, 'localhost', 8080);
        console.log('🔧 Ansluten till Firestore emulator');
      } catch (error) {
        console.warn('Kunde inte ansluta till Firestore emulator:', error.message);
      }
    }
  }
  return firestoreInstance;
};

/**
 * Hämtar Firebase Auth-instans med lazy loading
 * Skapar och cachar Auth-instansen första gången den efterfrågas
 *
 * @returns {Auth} Konfigurerad Firebase Auth-instans
 */
const getFirebaseAuth = () => {
  if (!authInstance) {
    const app = ensureFirebaseApp();
    authInstance = getAuth(app);

    // Development-mode: Anslut till Auth emulator om konfigurerat
    if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_AUTH_EMULATOR === 'true') {
      try {
        connectAuthEmulator(authInstance, 'http://localhost:9099');
        console.log('🔧 Ansluten till Auth emulator');
      } catch (error) {
        console.warn('Kunde inte ansluta till Auth emulator:', error.message);
      }
    }
  }
  return authInstance;
};

/**
 * Hämtar Firebase app-instans direkt
 * Använd denna bara om du behöver app-instansen själv, annars använd getFirebaseDb/getFirebaseAuth
 *
 * @returns {FirebaseApp} Firebase app-instans
 */
const getFirebaseApp = () => ensureFirebaseApp();

/**
 * Kontrollerar om Firebase är korrekt konfigurerat
 * Användbar för att avgöra om Firebase-funktioner är tillgängliga
 *
 * @returns {boolean} True om Firebase är konfigurerat och redo att användas
 */
const hasFirebaseConfig = () => isFirebaseConfigured;

/**
 * Exporterar alla Firebase-funktioner som named exports för optimal tree-shaking
 */
export { getFirebaseApp, getFirebaseDb, getFirebaseAuth, hasFirebaseConfig };

/**
 * Default export med alla funktioner samlade (för bakåtkompatibilitet)
 */
export default {
  getFirebaseApp,
  getFirebaseDb,
  getFirebaseAuth,
  hasFirebaseConfig
};

