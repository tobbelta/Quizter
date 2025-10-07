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
  updateProfile,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb, hasFirebaseConfig } from '../firebaseClient';
import { userPreferencesService } from '../services/userPreferencesService';

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
  console.log('mapFirebaseUser: raw data from firestore:', data);
  const profile = data.profile || {};
  const isSuperUser = data.isSuperUser === true;

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[Auth] mapFirebaseUser', {
      uid: firebaseUser.uid,
      email: firebaseUser.email || null,
      isSuperUser,
      profile
    });
  }

  return {
    id: firebaseUser.uid,
    name: profile.displayName || firebaseUser.displayName || firebaseUser.email || 'Användare',
    email: firebaseUser.email || null,
    contact: profile.contact || firebaseUser.email || null,
    isAnonymous: firebaseUser.isAnonymous,
    isSuperUser,
    profile
  };
};

/** Skapar eller kompletterar användardokumentet i Firestore. */
const ensureUserDoc = async (firebaseUser, { profileOverride } = {}) => {
  if (!firebaseDb || !firebaseUser) return;
  const docRef = doc(firebaseDb, 'users', firebaseUser.uid);
  let docSnapshot = null;

  try {
    docSnapshot = await getDoc(docRef);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Auth] Kunde inte läsa befintlig användarprofil:', error);
    }
  }

  const existingData = docSnapshot?.exists() ? docSnapshot.data() : null;

  const profilePayload = {
    displayName: profileOverride?.displayName || firebaseUser.displayName || firebaseUser.email || 'Användare',
    contact: profileOverride?.contact ?? firebaseUser.email ?? null
  };

  const payload = {
    profile: profilePayload,
    email: firebaseUser.email || null
  };

  if (!existingData?.createdAt) {
    payload.createdAt = serverTimestamp();
  }

  // isSuperUser sätts ENDAST manuellt i Firebase, aldrig via kod
  await setDoc(docRef, payload, { merge: true });
};

/** Context-provider som exponerar inloggnings- och registreringsmetoder. */
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => (usesFirebaseAuth ? null : readStoredUser()));
  const [isAuthInitialized, setAuthInitialized] = useState(!usesFirebaseAuth);

  useEffect(() => {
    if (!usesFirebaseAuth) {
      writeStoredUser(currentUser);
      setAuthInitialized(true);
    }
  }, [currentUser]);

  const syncFromFirebaseUser = useCallback(async (firebaseUser) => {
    if (!usesFirebaseAuth) return null;
    if (!firebaseUser) {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[Auth] Ingen Firebase-användare i sessionen (utloggad).');
      }
      setCurrentUser(null);
      setAuthInitialized(true);
      return null;
    }
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[Auth] syncFromFirebaseUser: hämtar profil', {
          uid: firebaseUser.uid,
          email: firebaseUser.email || null
        });
      }
      const mapped = await mapFirebaseUser(firebaseUser);
      if (mapped) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[Auth] syncFromFirebaseUser: profil klar', {
            uid: mapped.id,
            role: mapped.role,
            roles: mapped.roles
          });
        }
        setCurrentUser(mapped);
        setAuthInitialized(true);
        return mapped;
      }
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Auth] syncFromFirebaseUser: kunde inte hitta användardata', { uid: firebaseUser.uid });
      }
      setCurrentUser(null);
      setAuthInitialized(true);
      return null;
    } catch (error) {
      console.warn('Kunde inte tolka Firebase-användare', error);
      setCurrentUser(null);
      setAuthInitialized(true);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!usesFirebaseAuth || !firebaseAuth) return undefined;
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      // Om användaren inte är autentiserad, logga in som anonym automatiskt
      // Detta säkerställer att Firestore-queries alltid fungerar
      if (!user) {
        console.log('[Auth] Ingen användare autentiserad, skapar anonym användare...');
        try {
          const credential = await signInAnonymously(firebaseAuth);

          // Använd sparat alias om det finns
          const savedAlias = userPreferencesService.getAlias();
          const savedContact = userPreferencesService.getContact();

          if (savedAlias || savedContact) {
            console.log('[Auth] Använder sparat alias:', savedAlias);
            await ensureUserDoc(credential.user, {
              profileOverride: {
                displayName: savedAlias || 'Gäst',
                contact: savedContact || null
              }
            });
          }

          // onAuthStateChanged kommer att triggas igen med den nya anonyma användaren
          return;
        } catch (error) {
          console.error('[Auth] Kunde inte skapa anonym användare:', error);
          // Fortsätt ändå för att sätta isAuthInitialized
        }
      }
      syncFromFirebaseUser(user);
    });
    return unsubscribe;
  }, [syncFromFirebaseUser]);

  /** Loggar in användare (alla kan skapa/ansluta rundor) */
  const login = useCallback(async ({ email, password, name }) => {
    if (!usesFirebaseAuth) {
      const user = {
        id: uuidv4(),
        name: name || 'Användare',
        email,
        contact: email,
        isAnonymous: false,
        isSuperUser: false
      };
      if (process.env.NODE_ENV !== 'production') {
        console.info('[Auth] login (lokalt) lyckades', { email });
      }
      setCurrentUser(user);
      setAuthInitialized(true);
      return user;
    }
    if (!email || !password) {
      throw new Error('Ange e-post och lösenord.');
    }
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    if (name && credential.user.displayName !== name) {
      await updateProfile(credential.user, { displayName: name });
    }
    await ensureUserDoc(credential.user, {
      profileOverride: { displayName: name || credential.user.displayName }
    });
    if (process.env.NODE_ENV !== 'production') {
      console.info('[Auth] login lyckades', {
        uid: credential.user.uid,
        email: credential.user.email || null
      });
    }
    await syncFromFirebaseUser(credential.user);
    return credential.user;
  }, [syncFromFirebaseUser]);


  /** Registrerar användare och loggar in kontot direkt. */
  const register = useCallback(async ({ name, email, password, contact }) => {
    if (!usesFirebaseAuth) {
      if (!name?.trim()) {
        throw new Error('Ange ett namn.');
      }
      const user = {
        id: uuidv4(),
        name: name.trim(),
        email: email || null,
        contact: contact || email || null,
        isAnonymous: false,
        isSuperUser: false
      };
      setCurrentUser(user);
      setAuthInitialized(true);
      return user;
    }
    if (!name?.trim() || !email?.trim() || !password) {
      throw new Error('Fyll i namn, e-post och lösenord för att registrera.');
    }
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
    if (credential.user.displayName !== name.trim()) {
      await updateProfile(credential.user, { displayName: name.trim() });
    }
    await ensureUserDoc(credential.user, {
      profileOverride: { displayName: name.trim(), contact: contact || email.trim() }
    });
    await syncFromFirebaseUser(credential.user);
    return credential.user;
  }, [syncFromFirebaseUser]);

  /** Skapar gästkonto (offline eller anonym Firebase). */
  const loginAsGuest = useCallback(async ({ alias, contact }) => {
    if (!usesFirebaseAuth) {
      const user = {
        id: uuidv4(),
        name: alias || 'Gäst',
        contact: contact || null,
        isAnonymous: true,
        isSuperUser: false
      };
      setCurrentUser(user);
      setAuthInitialized(true);
      return user;
    }
    try {
      // Spara alias och kontakt lokalt
      if (alias) {
        userPreferencesService.saveAlias(alias);
      }
      if (contact) {
        userPreferencesService.saveContact(contact);
      }

      // Om användaren redan är anonym, uppdatera bara profilen
      const currentFirebaseUser = firebaseAuth.currentUser;
      if (currentFirebaseUser && currentFirebaseUser.isAnonymous) {
        console.log('[Auth] Användaren är redan anonym, uppdaterar profil...');
        await ensureUserDoc(currentFirebaseUser, {
          profileOverride: { displayName: alias || currentFirebaseUser.displayName || 'Gäst', contact: contact || null }
        });
        await syncFromFirebaseUser(currentFirebaseUser);
        return currentFirebaseUser;
      }

      // Annars skapa ny anonym användare
      const credential = await signInAnonymously(firebaseAuth);
      await ensureUserDoc(credential.user, {
        profileOverride: { displayName: alias || credential.user.displayName || 'Gäst', contact: contact || null }
      });
      await syncFromFirebaseUser(credential.user);
      return credential.user;
    } catch (error) {
      // Om Firebase inte tillåter anonyma användare, använd offline-läge
      if (error.code === 'auth/admin-restricted-operation') {
        console.warn('[Auth] Anonymous login disabled in Firebase, using offline mode');
        const user = {
          id: uuidv4(),
          name: alias || 'Gäst',
          contact: contact || null,
          isAnonymous: true,
          isSuperUser: false
        };
        setCurrentUser(user);
        setAuthInitialized(true);
        return user;
      }
      throw error;
    }
  }, [syncFromFirebaseUser]);

  /** Loggar ut användaren och rensar ev. offline-data. */
  const logout = useCallback(async () => {
    if (usesFirebaseAuth) {
      await signOut(firebaseAuth);
    } else {
      setCurrentUser(null);
      setAuthInitialized(true);
    }
  }, []);

  const value = useMemo(() => ({
    currentUser,
    isAuthenticated: Boolean(currentUser),
    isSuperUser: currentUser?.isSuperUser === true,
    isAuthInitialized,
    login,
    register,
    loginAsGuest,
    logout,
    usesFirebaseAuth
  }), [
    currentUser,
    isAuthInitialized,
    login,
    register,
    loginAsGuest,
    logout
  ]);

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
