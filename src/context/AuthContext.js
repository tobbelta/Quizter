import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'tipspromenad:auth';

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

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => readStoredUser());

  useEffect(() => {
    writeStoredUser(currentUser);
  }, [currentUser]);

  const loginAsAdmin = useCallback(({ email, name }) => {
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
  }, []);

  const loginAsRegistered = useCallback(({ name, email }) => {
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
  }, []);

  const loginAsGuest = useCallback(({ alias, contact }) => {
    const user = {
      id: uuidv4(),
      name: alias || 'Gäst',
      contact: contact || null,
      isAnonymous: true,
      role: 'guest'
    };
    setCurrentUser(user);
    return user;
  }, []);

  const logout = useCallback(() => setCurrentUser(null), []);

  const value = useMemo(() => ({
    currentUser,
    isAuthenticated: Boolean(currentUser),
    isAdmin: currentUser?.role === 'admin',
    loginAsAdmin,
    loginAsRegistered,
    loginAsGuest,
    logout
  }), [currentUser, loginAsAdmin, loginAsRegistered, loginAsGuest, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth måste användas inom AuthProvider');
  }
  return context;
};
