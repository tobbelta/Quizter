import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../shared/Header';
import { auth } from '../../firebase';

const GameMasterDashboard = ({ user, userData }) => {
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await auth.signOut();
            navigate('/');
        } catch (error) {
            console.error("Fel vid utloggning:", error);
        }
    };

    return (
        // **KORRIGERING:** Hela sidan slås in i en container, precis som på den
        // fungerande TeamsPage.js. Detta garanterar en konsekvent och centrerad layout.
        <div className="container mx-auto p-4">
            <Header title="Game Master Panel" user={user} userData={userData}>
                <Link to="/teams" className="neu-button">Spelarsida</Link>
                <button onClick={handleLogout} className="neu-button neu-button-red">
                    Logga ut
                </button>
            </Header>

            <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
                {/* Kort för banhantering */}
                <Link to="/gm/courses" className="neu-card hover:shadow-lg transition-shadow duration-300">
                    <h2 className="text-2xl font-bold text-accent-lime mb-2">Hantera Banor</h2>
                    <p className="text-text-secondary">Skapa, redigera och visa alla tillgängliga banor.</p>
                </Link>

                {/* Kort för hinderbank */}
                <Link to="/gm/obstacles" className="neu-card hover:shadow-lg transition-shadow duration-300">
                    <h2 className="text-2xl font-bold text-accent-yellow mb-2">Hinderbank</h2>
                    <p className="text-text-secondary">Administrera alla återanvändbara hinder och gåtor.</p>
                </Link>

                {/* Kort för användarhantering */}
                <Link to="/gm/users" className="neu-card hover:shadow-lg transition-shadow duration-300">
                    <h2 className="text-2xl font-bold text-accent-cyan mb-2">Användare</h2>
                    <p className="text-text-secondary">Hantera användarroller och se registrerade spelare.</p>
                </Link>

                {/* Kort för laghantering */}
                <Link to="/gm/teams" className="neu-card hover:shadow-lg transition-shadow duration-300">
                    <h2 className="text-2xl font-bold text-accent-magenta mb-2">Lag</h2>
                    <p className="text-text-secondary">Se och hantera alla skapade lag.</p>
                </Link>

                {/* Kort för live-övervakning */}
                <Link to="/gm/monitor" className="neu-card hover:shadow-lg transition-shadow duration-300">
                    <h2 className="text-2xl font-bold text-accent-red mb-2">Live-övervakning</h2>
                    <p className="text-text-secondary">Övervaka pågående spel i realtid.</p>
                </Link>
            </main>
        </div>
    );
};

export default GameMasterDashboard;

