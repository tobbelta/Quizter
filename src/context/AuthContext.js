/**
 * Hanterar autentisering för både offline-läge och Firebase-backend.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
// Removed all Firebase imports
// import { getFirebaseAuth, getFirebaseDb, hasFirebaseConfig } from '../firebaseClient'; // Removed legacy Firebase imports
// import { userPreferencesService } from '../services/userPreferencesService'; // Removed unused import

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

// const usesFirebaseAuth = false; // Firebase removed
// const firebaseAuth = null;
// const firebaseDb = null;

// Removed all Firebase user mapping logic

/** Skapar eller kompletterar användardokumentet i Firestore. */
// ...dead code removed...

/** Context-provider som exponerar inloggnings- och registreringsmetoder. */
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => readStoredUser());
  const [isAuthInitialized, setAuthInitialized] = useState(true);

  useEffect(() => {
    writeStoredUser(currentUser);
    setAuthInitialized(true);
  }, [currentUser]);


  /** Loggar in användare (alla kan skapa/ansluta rundor) */
  const login = useCallback(async ({ email, password, name }) => {
    // Kolla superuser-status via Cloudflare API
    let isSuperUser = false;
    if (email) {
      try {
        const response = await fetch('/api/isSuperuser', {
          method: 'GET',
          headers: { 'x-user-email': email }
        });
        const data = await response.json();
        isSuperUser = data.isSuperuser === true;
      } catch (err) {
        console.warn('Kunde inte kolla superuser-status', err);
      }
    }
    const user = {
      id: uuidv4(),
      name: name || 'Användare',
      email,
      contact: email,
      isAnonymous: false,
      isSuperUser
    };
    if (process.env.NODE_ENV !== 'production') {
      console.info('[Auth] login (lokalt) lyckades', { email, isSuperUser });
    }
    setCurrentUser(user);
    setAuthInitialized(true);
    return user;
  }, []);


  /** Registrerar användare och loggar in kontot direkt. */
  const register = useCallback(async ({ name, email, password, contact }) => {
    if (!name?.trim()) {
      throw new Error('Ange ett namn.');
    }
    let isSuperUser = false;
    if (email) {
      try {
        const response = await fetch('/api/isSuperuser', {
          method: 'GET',
          headers: { 'x-user-email': email }
        });
        const data = await response.json();
        isSuperUser = data.isSuperuser === true;
      } catch (err) {
        console.warn('Kunde inte kolla superuser-status', err);
      }
    }
    const user = {
      id: uuidv4(),
      name: name.trim(),
      email: email || null,
      contact: contact || email || null,
      isAnonymous: false,
      isSuperUser
    };
    setCurrentUser(user);
    setAuthInitialized(true);
    return user;
  }, []);

  /** Skapar gästkonto (offline). */
  const loginAsGuest = useCallback(async ({ alias, contact }) => {
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
  }, []);

  /** Loggar ut användaren och rensar ev. offline-data. */
  const logout = useCallback(async () => {
    setCurrentUser(null);
    setAuthInitialized(true);
  }, []);

  const value = useMemo(() => ({
    currentUser,
    isAuthenticated: Boolean(currentUser),
    isSuperUser: currentUser?.isSuperUser === true,
    isAuthInitialized,
    login,
    register,
    loginAsGuest,
    logout
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
