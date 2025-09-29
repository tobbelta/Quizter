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
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[Auth] mapFirebaseUser', {
      uid: firebaseUser.uid,
      email: firebaseUser.email || null,
      roles,
      profile,
      calculatedRole: roles.admin ? 'admin' : roles.player ? 'player' : 'guest'
    });
  }
  const calculatedRole = roles.admin ? 'admin' : roles.player ? 'player' : 'guest';
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[Auth] mapFirebaseUser role calculation', {
      roles,
      'roles.admin': roles.admin,
      'roles.player': roles.player,
      'typeof roles': typeof roles,
      'Object.keys(roles)': Object.keys(roles),
      'JSON.stringify(roles)': JSON.stringify(roles),
      calculatedRole
    });
  }
  return {
    id: firebaseUser.uid,
    name: profile.displayName || firebaseUser.displayName || firebaseUser.email || 'Användare',
    email: firebaseUser.email || null,
    contact: profile.contact || firebaseUser.email || null,
    isAnonymous: firebaseUser.isAnonymous,
    role: calculatedRole,
    roles,
    profile
  };
};

/** Skapar eller kompletterar användardokumentet i Firestore. */
const ensureUserDoc = async (firebaseUser, { profileOverride, roleFlags } = {}) => {
  if (!firebaseDb || !firebaseUser) return;
  const docRef = doc(firebaseDb, 'users', firebaseUser.uid);
  const profilePayload = {
    displayName: profileOverride?.displayName || firebaseUser.displayName || firebaseUser.email || 'Användare',
    contact: profileOverride?.contact ?? firebaseUser.email ?? null
  };
  const payload = { profile: profilePayload };
  if (roleFlags) {
    payload.roles = {};
    Object.entries(roleFlags).forEach(([roleKey, enabled]) => {
      payload.roles[roleKey] = Boolean(enabled);
    });
  }
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
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      syncFromFirebaseUser(user);
    });
    return unsubscribe;
  }, [syncFromFirebaseUser]);

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
      if (process.env.NODE_ENV !== 'production') {
        console.info('[Auth] loginAsAdmin (lokalt) lyckades', { email });
      }
      setCurrentUser(user);
      setAuthInitialized(true);
      return user;
    }
    if (!email || !password) {
      throw new Error('Ange e-post och lösenord för administratörsinloggning.');
    }
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    if (name && credential.user.displayName !== name) {
      await updateProfile(credential.user, { displayName: name });
    }
    await ensureUserDoc(credential.user, {
      roleFlags: { admin: true, player: true }
    });
    if (process.env.NODE_ENV !== 'production') {
      console.info('[Auth] loginAsAdmin lyckades - updating roles', {
        uid: credential.user.uid,
        email: credential.user.email || null
      });
    }
    // Ge Firestore lite tid att uppdatera och läs sedan om användardata
    await new Promise(resolve => setTimeout(resolve, 100));
    await syncFromFirebaseUser(credential.user);
    return credential.user;
  }, [syncFromFirebaseUser]);

  /** Loggar in registrerad spelare. */
  const loginAsRegistered = useCallback(async ({ email, password, name }) => {
    if (!usesFirebaseAuth) {
      const user = {
        id: uuidv4(),
        name: name || 'Spelare',
        email,
        contact: email,
        isAnonymous: false,
        role: 'player'
      };
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
      roleFlags: { player: true }
    });
    if (process.env.NODE_ENV !== 'production') {
      console.info('[Auth] loginAsRegistered lyckades', {
        uid: credential.user.uid,
        email: credential.user.email || null
      });
    }
    await syncFromFirebaseUser(credential.user);
    return credential.user;
  }, [syncFromFirebaseUser]);

  /** Registrerar spelare och loggar in kontot direkt. */
  const registerPlayer = useCallback(async ({ name, email, password, contact }) => {
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
        role: 'player'
      };
      setCurrentUser(user);
      setAuthInitialized(true);
      return user;
    }
    if (!name?.trim() || !email?.trim() || !password) {
      throw new Error('Fyll i namn, e-post och lösenord för att registrera spelare.');
    }
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
    if (credential.user.displayName !== name.trim()) {
      await updateProfile(credential.user, { displayName: name.trim() });
    }
    await ensureUserDoc(credential.user, {
      profileOverride: { displayName: name.trim(), contact: contact || email.trim() },
      roleFlags: { player: true }
    });
    await syncFromFirebaseUser(credential.user);
    return credential.user;
  }, [syncFromFirebaseUser]);

  /** Registrerar administratör och sätter både admin- och spelarroller. */
  const registerAdmin = useCallback(async ({ name, email, password, contact }) => {
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
        role: 'admin'
      };
      setCurrentUser(user);
      setAuthInitialized(true);
      return user;
    }
    if (!name?.trim() || !email?.trim() || !password) {
      throw new Error('Fyll i namn, e-post och lösenord för att registrera administratör.');
    }
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
    if (credential.user.displayName !== name.trim()) {
      await updateProfile(credential.user, { displayName: name.trim() });
    }
    await ensureUserDoc(credential.user, {
      profileOverride: { displayName: name.trim(), contact: contact || email.trim() },
      roleFlags: { admin: true, player: true }
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
        role: 'guest'
      };
      setCurrentUser(user);
      setAuthInitialized(true);
      return user;
    }
    try {
      const credential = await signInAnonymously(firebaseAuth);
      await ensureUserDoc(credential.user, {
        profileOverride: { displayName: alias || credential.user.displayName || 'Gäst', contact: contact || null },
        roleFlags: { guest: true }
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
          role: 'guest'
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
    isAdmin: currentUser?.role === 'admin',
    isAuthInitialized,
    loginAsAdmin,
    loginAsRegistered,
    loginAsGuest,
    registerPlayer,
    registerAdmin,
    logout,
    usesFirebaseAuth
  }), [
    currentUser,
    isAuthInitialized,
    loginAsAdmin,
    loginAsRegistered,
    loginAsGuest,
    registerPlayer,
    registerAdmin,
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
