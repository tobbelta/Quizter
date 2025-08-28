import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

import Login from './components/auth/Login';
import Register from './components/auth/Register';
import TeamsPage from './components/player/TeamsPage';
import Lobby from './components/player/Lobby';
import GameScreen from './components/player/GameScreen';
import GameMasterDashboard from './components/gameMaster/GameMasterDashboard';
import Spinner from './components/shared/Spinner';
import SpectateScreen from './components/gameMaster/SpectateScreen';
import GameReport from './components/player/GameReport';
import ReplayScreenV2 from './components/player/ReplayScreenV2';

function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData(data);
          setUserRole(data.role);
        } else {
          const defaultUserData = {
            email: currentUser.email,
            displayName: currentUser.email.split('@')[0],
            role: 'player',
            createdAt: new Date(),
          };
          await setDoc(userDocRef, defaultUserData);
          setUserData(defaultUserData);
          setUserRole(defaultUserData.role);
        }
      } else {
        setUser(null);
        setUserRole(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;
  }

  const ProtectedRoute = ({ children, allowedRoles }) => {
    if (!user) return <Navigate to="/login" />;
    if (allowedRoles && !allowedRoles.includes(userRole)) return <Navigate to="/" />;
    return React.cloneElement(children, { user, userData });
  };
  
  const AuthRedirect = () => {
      if (!user) return <Navigate to="/login" />;
      if (userRole === 'gameMaster') return <Navigate to="/gamemaster" />;
      if (userRole === 'player') return <Navigate to="/teams" />;
      return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;
  }

  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        <Route path="/register" element={!user ? <Register /> : <Navigate to="/" />} />
        <Route path="/" element={<AuthRedirect />} />
        <Route path="/teams" element={<ProtectedRoute allowedRoles={['player']}><TeamsPage /></ProtectedRoute>} />
        <Route path="/lobby/:teamId" element={<ProtectedRoute allowedRoles={['player']}><Lobby /></ProtectedRoute>} />
        <Route path="/game/:gameId" element={<ProtectedRoute allowedRoles={['player']}><GameScreen /></ProtectedRoute>} />
        <Route path="/report/:gameId" element={<ProtectedRoute allowedRoles={['player', 'gameMaster']}><GameReport /></ProtectedRoute>} />
        <Route path="/replay-v2/:gameId" element={<ProtectedRoute allowedRoles={['player', 'gameMaster']}><ReplayScreenV2 /></ProtectedRoute>} />
        <Route path="/gamemaster" element={<ProtectedRoute allowedRoles={['gameMaster']}><GameMasterDashboard /></ProtectedRoute>} />
        <Route path="/spectate/:gameId" element={<ProtectedRoute allowedRoles={['gameMaster']}><SpectateScreen /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

export default App;
