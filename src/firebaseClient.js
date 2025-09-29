/**
 * Firebase Klient - Centraliserad Firebase-initialisering och konfiguration
 *
 * Hanterar Firebase app-instans som en enda delad instans och säkerställer korrekt
 * konfiguration från miljövariabler. Alla Firebase-tjänster (Firestore, Auth)
 * skapas via denna modul.
 *
 * Den här filen ansvarar för att:
 * - Läsa Firebase-inställningar från .env-filen
 * - Skapa en enda Firebase-instans som delas av hela appen
 * - Ansluta till utvecklings-emulatorer när det behövs
 * - Ge tydliga felmeddelanden om konfiguration saknas
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
 * Dessa fyra fält måste finnas för att Firebase ska fungera
 */
const OBLIGATORISKA_KONFIG_NYCKLAR = ['apiKey', 'authDomain', 'projectId', 'appId'];

/**
 * Kontrollerar om alla nödvändiga Firebase-inställningar är ifyllda
 * Returnerar sant om alla obligatoriska fält finns och innehåller text
 */
const arFirebaseInställningarKompletta = OBLIGATORISKA_KONFIG_NYCKLAR.every((nyckel) => {
  const värde = firebaseConfig[nyckel];
  return typeof värde === 'string' && värde.trim().length > 0;
});

/**
 * Enda delade Firebase app-instans
 * Sparar app-instansen för att undvika att skapa flera kopior
 */
let appInstans = null;
let firestoreInstans = null;
let authInstans = null;

/**
 * Säkerställer att Firebase app är initialiserad och konfigurerad korrekt
 * Implementerar singleton-pattern för att återanvända samma instans
 *
 * @returns {FirebaseApp} Konfigurerad Firebase app-instans
 * @throws {Error} Om Firebase-konfiguration saknas eller är felaktig
 */
const säkerställFirebaseApp = () => {
  // Kontrollera konfiguration först
  if (!arFirebaseInställningarKompletta) {
    throw new Error(
      'Firebase är inte konfigurerat. Kontrollera att följande miljövariabler är satta i .env:\n' +
      OBLIGATORISKA_KONFIG_NYCKLAR.map(nyckel => `REACT_APP_FIREBASE_${nyckel.toUpperCase()}`).join('\n')
    );
  }

  // Återanvänd befintlig instans om den finns
  if (appInstans) {
    return appInstans;
  }

  // Kontrollera om Firebase redan är initialiserat (t.ex. av annan del av appen)
  const befintligaAppar = getApps();
  if (befintligaAppar.length > 0) {
    appInstans = befintligaAppar[0];
    return appInstans;
  }

  // Initialisera ny Firebase app
  try {
    appInstans = initializeApp(firebaseConfig);

    // Development-mode: Anslut till emulatorer om de körs
    if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_FIREBASE_EMULATOR === 'true') {
      console.log('🔧 Ansluter till Firebase emulatorer...');
      // Emulator-anslutning kan läggas till här vid behov
    }

    return appInstans;
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
const hämtaFirebaseDb = () => {
  if (!firestoreInstans) {
    const app = säkerställFirebaseApp();
    firestoreInstans = getFirestore(app);

    // Development-mode: Anslut till Firestore emulator om konfigurerat
    if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_FIRESTORE_EMULATOR === 'true') {
      try {
        connectFirestoreEmulator(firestoreInstans, 'localhost', 8080);
        console.log('🔧 Ansluten till Firestore emulator');
      } catch (error) {
        console.warn('Kunde inte ansluta till Firestore emulator:', error.message);
      }
    }
  }
  return firestoreInstans;
};

/**
 * Hämtar Firebase Auth-instans med lazy loading
 * Skapar och cachar Auth-instansen första gången den efterfrågas
 *
 * @returns {Auth} Konfigurerad Firebase Auth-instans
 */
const hämtaFirebaseAuth = () => {
  if (!authInstans) {
    const app = säkerställFirebaseApp();
    authInstans = getAuth(app);

    // Development-mode: Anslut till Auth emulator om konfigurerat
    if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_AUTH_EMULATOR === 'true') {
      try {
        connectAuthEmulator(authInstans, 'http://localhost:9099');
        console.log('🔧 Ansluten till Auth emulator');
      } catch (error) {
        console.warn('Kunde inte ansluta till Auth emulator:', error.message);
      }
    }
  }
  return authInstans;
};

/**
 * Hämtar Firebase app-instans direkt
 * Använd denna bara om du behöver app-instansen själv, annars använd hämtaFirebaseDb/hämtaFirebaseAuth
 *
 * @returns {FirebaseApp} Firebase app-instans
 */
const hämtaFirebaseApp = () => säkerställFirebaseApp();

/**
 * Kontrollerar om Firebase är korrekt konfigurerat
 * Användbar för att avgöra om Firebase-funktioner är tillgängliga
 *
 * @returns {boolean} True om Firebase är konfigurerat och redo att användas
 */
const harFirebaseKonfiguration = () => arFirebaseInställningarKompletta;

/**
 * Exporterar alla Firebase-funktioner som named exports för optimal tree-shaking
 * Använder engelska namn för extern kompatibilitet
 */
export {
  hämtaFirebaseApp as getFirebaseApp,
  hämtaFirebaseDb as getFirebaseDb,
  hämtaFirebaseAuth as getFirebaseAuth,
  harFirebaseKonfiguration as hasFirebaseConfig
};

/**
 * Default export med alla funktioner samlade (för bakåtkompatibilitet)
 */
export default {
  getFirebaseApp: hämtaFirebaseApp,
  getFirebaseDb: hämtaFirebaseDb,
  getFirebaseAuth: hämtaFirebaseAuth,
  hasFirebaseConfig: harFirebaseKonfiguration
};

