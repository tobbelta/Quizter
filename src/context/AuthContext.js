/**
 * AuthContext - Hanterar autentisering via Cloudflare API
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

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

/** Context-provider som exponerar inloggnings- och registreringsmetoder. */
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => readStoredUser());
  const [isAuthInitialized, setAuthInitialized] = useState(true);

  useEffect(() => {
    writeStoredUser(currentUser);
    setAuthInitialized(true);
  }, [currentUser]);


  /** Loggar in användare via backend */
  const login = useCallback(async ({ email, password }) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Kunde inte logga in.');
    }
    const user = data.user;
    setCurrentUser(user);
    setAuthInitialized(true);
    return user;
  }, []);


  /** Startar registrering (skickar verifieringsmail). */
  const register = useCallback(async ({ name, email }) => {
    if (!name?.trim()) {
      throw new Error('Ange ett namn.');
    }
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Kunde inte skapa konto.');
    }
    return data;
  }, []);

  /** Slutför registrering efter verifiering och loggar in. */
  const completeRegistration = useCallback(async ({ token, password }) => {
    const response = await fetch('/api/auth/completeRegistration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Kunde inte slutföra registreringen.');
    }
    const user = data.user;
    setCurrentUser(user);
    setAuthInitialized(true);
    return user;
  }, []);

  /** Skapar gästkonto (offline). */
  const loginAsGuest = useCallback(async ({ alias, contact } = {}) => {
    const id = uuidv4();
    const cleanAlias = typeof alias === 'string' ? alias.trim() : '';
    const user = {
      id,
      name: cleanAlias || id,
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
    completeRegistration,
    loginAsGuest,
    logout
  }), [
    currentUser,
    isAuthInitialized,
    login,
    register,
    completeRegistration,
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
