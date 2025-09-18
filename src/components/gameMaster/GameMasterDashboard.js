import React from 'react';
import { Link, useNavigate, Outlet, useLocation } from 'react-router-dom';
import Header from '../shared/Header';
import { auth } from '../../firebase';

// Denna komponent blir nu en permanent "ram" för alla GM-sidor.
const GameMasterDashboard = ({ user, userData }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = async () => {
        try {
            await auth.signOut();
            navigate('/');
        } catch (error) {
            console.error("Fel vid utloggning:", error);
        }
    };

    // En hjälpfunktion för att styla den aktiva knappen
    const getButtonClass = (path) => {
        return location.pathname === path
            ? 'sc-button sc-button-blue' // Aktiv knapp-stil
            : 'sc-button';
    };

    return (
        <div className="container mx-auto p-4 max-w-7xl">
            {/* Header och knappar som alltid visas */}
            <Header title="Game Master Panel" user={user} userData={userData}>
                <Link to="/teams" className="sc-button">Spelarsida</Link>
                <button onClick={handleLogout} className="sc-button sc-button-red">
                    Logga ut
                </button>
            </Header>

            <nav className="my-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700 flex flex-wrap gap-4 justify-center">
                <Link to="/gm" className={getButtonClass('/gm')}>Spel</Link>
                <Link to="/gm/courses" className={getButtonClass('/gm/courses')}>Banor</Link>
                <Link to="/gm/obstacles" className={getButtonClass('/gm/obstacles')}>Hinder</Link>
                <Link to="/gm/users" className={getButtonClass('/gm/users')}>Användare</Link>
                <Link to="/gm/teams" className={getButtonClass('/gm/teams')}>Lag</Link>
            </nav>

            <main>
                {/* Här kommer undersidorna (LiveMonitor, CourseManagement, etc.) att renderas */}
                <Outlet />
            </main>
        </div>
    );
};

export default GameMasterDashboard;