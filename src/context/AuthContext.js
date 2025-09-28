/**
 * Hanterar autentisering för både offline-läge och Firebase-backend.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  signInWithEmailAndPassword,
  signOut,
  signInAnonymously,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb, hasFirebaseConfig } from '../firebaseClient';

const STORAGE_KEY = 'tipspromenad:auth';

/** Läser in sparad offline-användare från localStorage. */
const readStoredUser = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Kunde inte läsa auth från storage', error);
    return null;
  }
};

/** Skriver eller rensar offline-användare i localStorage. */
const writeStoredUser = (value) => {
  if (typeof window === 'undefined') return;
  try {
    if (!value) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
  } catch (error) {
    console.warn('Kunde inte skriva auth till storage', error);
  }
};

const AuthContext = createContext();

const usesFirebaseAuth = hasFirebaseConfig();
const firebaseAuth = usesFirebaseAuth ? getFirebaseAuth() : null;
const firebaseDb = usesFirebaseAuth ? getFirebaseDb() : null;

/** Mappar en Firebase-användare till vårt enklare auth-objekt. */
const mapFirebaseUser = async (firebaseUser) => {
  if (!firebaseDb || !firebaseUser) return null;
  const docRef = doc(firebaseDb, 'users', firebaseUser.uid);
  const docSnap = await getDoc(docRef);
  const data = docSnap.exists() ? docSnap.data() : {};
  const profile = data.profile || {};
  const roles = data.roles || {};
  return {
    id: firebaseUser.uid,
    name: profile.displayName || firebaseUser.displayName || firebaseUser.email || 'Användare',
    email: firebaseUser.email || null,
    contact: profile.contact || firebaseUser.email || null,
    isAnonymous: firebaseUser.isAnonymous,
    role: roles.admin ? 'admin' : 'player',
    roles,
    profile
  };
};

/** Context-provider som exponerar inloggningsmetoder till appen. */
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => (usesFirebaseAuth ? null : readStoredUser()));

  useEffect(() => {
    if (!usesFirebaseAuth) {
      writeStoredUser(currentUser);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!usesFirebaseAuth || !firebaseAuth) return undefined;
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        try {
          const mapped = await mapFirebaseUser(user);
          if (mapped) {
            setCurrentUser(mapped);
          }
        } catch (error) {
          console.warn('Kunde inte hämta användarprofil', error);
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
    });
    return unsubscribe;
  }, []);

  /** Skapar användardokument i Firestore om det saknas. */
  const ensureUserDoc = useCallback(async (firebaseUser) => {
    if (!firebaseDb || !firebaseUser) return;
    const docRef = doc(firebaseDb, 'users', firebaseUser.uid);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      await setDoc(docRef, {
        profile: {
          displayName: firebaseUser.displayName || firebaseUser.email || 'Användare',
          contact: firebaseUser.email || null
        },
        roles: {}
      }, { merge: true });
    }
  }, []);

  /** Loggar in administratör antingen lokalt eller via Firebase. */
  const loginAsAdmin = useCallback(async ({ email, password, name }) => {
    if (!usesFirebaseAuth) {
      const user = {
        id: uuidv4(),
        name: name || 'Admin',
        email,
        contact: email,
        isAnonymous: false,
        role: 'admin'
      };
      setCurrentUser(user);
      return user;
    }
    if (!email || !password) {
      throw new Error('Ange e-post och lösenord för administratörsinloggning.');
    }
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    if (name && credential.user.displayName !== name) {
      await updateProfile(credential.user, { displayName: name });
    }
    await ensureUserDoc(credential.user);
    return credential.user;
  }, [ensureUserDoc]);

  /** Loggar in registrerad spelare. */
  const loginAsRegistered = useCallback(async ({ email, password, name }) => {
    if (!usesFirebaseAuth) {
      const user = {
        id: uuidv4(),
        name,
        email,
        contact: email,
        isAnonymous: false,
        role: 'player'
      };
      setCurrentUser(user);
      return user;
    }
    if (!email || !password) {
      throw new Error('Ange e-post och lösenord.');
    }
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    if (name && credential.user.displayName !== name) {
      await updateProfile(credential.user, { displayName: name });
    }
    await ensureUserDoc(credential.user);
    return credential.user;
  }, [ensureUserDoc]);

  /** Skapar gästkonto (offline eller anonym Firebase). */
  const loginAsGuest = useCallback(async ({ alias, contact }) => {
    if (!usesFirebaseAuth) {
      const user = {
        id: uuidv4(),
        name: alias || 'Gäst',
        contact: contact || null,
        isAnonymous: true,
        role: 'guest'
      };
      setCurrentUser(user);
      return user;
    }
    const credential = await signInAnonymously(firebaseAuth);
    await ensureUserDoc(credential.user);
    return credential.user;
  }, [ensureUserDoc]);

  /** Loggar ut användaren och rensar ev. offline-data. */
  const logout = useCallback(async () => {
    if (usesFirebaseAuth) {
      await signOut(firebaseAuth);
    } else {
      setCurrentUser(null);
    }
  }, []);

  const value = useMemo(() => ({
    currentUser,
    isAuthenticated: Boolean(currentUser),
    isAdmin: currentUser?.role === 'admin',
    loginAsAdmin,
    loginAsRegistered,
    loginAsGuest,
    logout,
    usesFirebaseAuth
  }), [currentUser, loginAsAdmin, loginAsRegistered, loginAsGuest, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

/** Hook som ger tillgång till auth-contexten. */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth måste användas inom AuthProvider');
  }
  return context;
};
