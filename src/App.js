import React, { useState, useEffect } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

import { DebugProvider } from './context/DebugContext';
import DebugBanner from './components/shared/DebugBanner';

import Spinner from './components/shared/Spinner';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import TeamsPage from './components/player/TeamsPage';
import Lobby from './components/player/Lobby';
import GameScreen from './components/player/GameScreen';
import GameMasterDashboard from './components/gameMaster/GameMasterDashboard';
import CourseManagement from './components/gameMaster/CourseManagement';
import UserManagement from './components/gameMaster/UserManagement';
import TeamManagement from './components/gameMaster/TeamManagement';
import LiveMonitor from './components/gameMaster/LiveMonitor';
import CourseCreator from './components/gameMaster/CourseCreator';
import ObstacleBank from './components/gameMaster/ObstacleBank';
import SpectateScreen from './components/gameMaster/SpectateScreen';
import JsonDataScreen from './components/player/JsonDataScreen';
import GameReport from './components/player/GameReport';
import ReplayScreenV2 from './components/player/ReplayScreenV2';
import VersionHistory from './components/gameMaster/VersionHistory';

const PrivateRoute = ({ isAuth, children }) => {
    return isAuth ? children : <Navigate to="/" />;
};

const AdminRoute = ({ isAuth, isGM, children }) => {
    if (!isAuth) {
        return <Navigate to="/" />;
    }
    return isGM ? children : <Navigate to="/teams" />;
};

const PublicRoute = ({ isAuth, isGM, children }) => {
    if (isAuth) {
        return isGM ? <Navigate to="/gm" /> : <Navigate to="/teams" />;
    }
    return children;
};

function App() {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (userAuth) => {
            if (userAuth) {
                const userRef = doc(db, 'users', userAuth.uid);
                const userSnap = await getDoc(userRef);
                
                const data = userSnap.exists() ? userSnap.data() : null;
                
                setUser(userAuth);
                setUserData(data);
            } else {
                setUser(null);
                setUserData(null);
            }
            setIsLoading(false);
        });
        return unsubscribe;
    }, []);

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;
    }

    const isAuthenticated = !!user;
    const isGameMaster = userData?.role === 'gameMaster';
    
    return (
        <DebugProvider>
            <div className="min-h-screen bg-background text-text-primary flex flex-col">
                <Routes>
                    <Route path="/" element={<PublicRoute isAuth={isAuthenticated} isGM={isGameMaster}><Login /></PublicRoute>} />
                    <Route path="/register" element={<PublicRoute isAuth={isAuthenticated} isGM={isGameMaster}><Register /></PublicRoute>} />
                    <Route path="/teams" element={<PrivateRoute isAuth={isAuthenticated}><TeamsPage user={user} userData={userData} /></PrivateRoute>} />
                    <Route path="/lobby/:gameId" element={<PrivateRoute isAuth={isAuthenticated}><Lobby user={user} userData={userData} /></PrivateRoute>} />
                    <Route path="/game/:gameId" element={<PrivateRoute isAuth={isAuthenticated}><GameScreen user={user} userData={userData} /></PrivateRoute>} />
                    <Route path="/json-data" element={<PrivateRoute isAuth={isAuthenticated}><JsonDataScreen user={user} userData={userData} /></PrivateRoute>} />
                    <Route path="/report/:gameId" element={<PrivateRoute isAuth={isAuthenticated}><GameReport user={user} userData={userData} /></PrivateRoute>} />
                    <Route path="/replay/:gameId" element={<PrivateRoute isAuth={isAuthenticated}><ReplayScreenV2 user={user} userData={userData} /></PrivateRoute>} />
                    <Route path="/gm" element={<AdminRoute isAuth={isAuthenticated} isGM={isGameMaster}><GameMasterDashboard user={user} userData={userData} /></AdminRoute>} />
                    <Route path="/gm/courses" element={<AdminRoute isAuth={isAuthenticated} isGM={isGameMaster}><CourseManagement user={user} userData={userData} /></AdminRoute>} />
                    <Route path="/gm/courses/new" element={<AdminRoute isAuth={isAuthenticated} isGM={isGameMaster}><CourseCreator user={user} userData={userData} /></AdminRoute>} />
                    <Route path="/gm/courses/edit/:courseId" element={<AdminRoute isAuth={isAuthenticated} isGM={isGameMaster}><CourseCreator user={user} userData={userData} /></AdminRoute>} />
                    <Route path="/gm/obstacles" element={<AdminRoute isAuth={isAuthenticated} isGM={isGameMaster}><ObstacleBank user={user} userData={userData} /></AdminRoute>} />
                    <Route path="/gm/users" element={<AdminRoute isAuth={isAuthenticated} isGM={isGameMaster}><UserManagement user={user} userData={userData} /></AdminRoute>} />
                    <Route path="/gm/teams" element={<AdminRoute isAuth={isAuthenticated} isGM={isGameMaster}><TeamManagement user={user} userData={userData} /></AdminRoute>} />
                    <Route path="/gm/monitor" element={<AdminRoute isAuth={isAuthenticated} isGM={isGameMaster}><LiveMonitor user={user} userData={userData} /></AdminRoute>} />
                    <Route path="/gm/spectate/:gameId" element={<AdminRoute isAuth={isAuthenticated} isGM={isGameMaster}><SpectateScreen user={user} userData={userData} /></AdminRoute>} />
                    {/* HÄR VAR FELET - NU KORRIGERAT */}
                    <Route path="/gm/history/:courseId" element={<AdminRoute isAuth={isAuthenticated} isGM={isGameMaster}><VersionHistory user={user} userData={userData} /></AdminRoute>} />
                    <Route path="*" element={<Navigate to={isAuthenticated ? (isGameMaster ? "/gm" : "/teams") : "/"} />} />
                </Routes>
                <DebugBanner />
            </div>
        </DebugProvider>
    );
}

export default App;

