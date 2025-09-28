/**
 * Samlad initialisering av Firebase för att kunna växla mellan lokal och moln.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];

const isFirebaseConfigured = requiredKeys.every((key) => {
  const value = firebaseConfig[key];
  return typeof value === 'string' && value.trim().length > 0;
});

let appInstance = null;

/**
 * Kontrollerar konfigurationen och återanvänder samma app-instans i hela klienten.
 */
const ensureApp = () => {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase är inte konfigurerat. Ange REACT_APP_FIREBASE_* variablerna i .env.');
  }
  if (!appInstance) {
    if (getApps().length === 0) {
      appInstance = initializeApp(firebaseConfig);
    } else {
      [appInstance] = getApps();
    }
  }
  return appInstance;
};

/** Hämta konfigurerad Firebase-app. */
export const getFirebaseApp = () => ensureApp();
/** Ger Firestore-instansen kopplad till appen. */
export const getFirebaseDb = () => getFirestore(ensureApp());
/** Ger Firebase Auth så att vi kan logga in användare. */
export const getFirebaseAuth = () => getAuth(ensureApp());
/** Signalerar om alla nödvändiga env-variabler är satta. */
export const hasFirebaseConfig = () => isFirebaseConfigured;

const firebaseClient = { 
  getFirebaseApp,
  getFirebaseDb,
  getFirebaseAuth,
  hasFirebaseConfig
 };

export default firebaseClient;

