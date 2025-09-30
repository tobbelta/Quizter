/**
 * Förenklad startsida med två huvudval: Starta runda eller Skapa runda
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/layout/Header';

const LandingPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleStartRun = () => {
    navigate('/join');
  };

  const handleCreateRun = () => {
    // Alla användare kan skapa rundor
    navigate('/generate');
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="GeoQuest" />

      <div className="mx-auto max-w-4xl px-4 py-16 pt-24">
        {/* Två huvudknappar */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Starta runda */}
          <button
            onClick={handleStartRun}
            className="group relative overflow-hidden rounded-2xl border-2 border-cyan-500/50 bg-gradient-to-br from-cyan-900/40 to-slate-900/60 p-8 hover:border-cyan-400 transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/20"
          >
            <div className="relative z-10">
              <div className="text-5xl mb-4">🎯</div>
              <h2 className="text-2xl font-bold mb-3 text-cyan-300 group-hover:text-cyan-200 transition-colors">
                Starta runda
              </h2>
              <p className="text-gray-300 group-hover:text-gray-200 transition-colors">
                Anslut till en befintlig runda med en kod och börja spela direkt
              </p>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 to-cyan-500/0 group-hover:from-cyan-500/10 group-hover:to-transparent transition-all duration-300" />
          </button>

          {/* Skapa runda */}
          <button
            onClick={handleCreateRun}
            className="group relative overflow-hidden rounded-2xl border-2 border-indigo-500/50 bg-gradient-to-br from-indigo-900/40 to-slate-900/60 p-8 hover:border-indigo-400 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20"
          >
            <div className="relative z-10">
              <div className="text-5xl mb-4">✨</div>
              <h2 className="text-2xl font-bold mb-3 text-indigo-300 group-hover:text-indigo-200 transition-colors">
                Skapa runda
              </h2>
              <p className="text-gray-300 group-hover:text-gray-200 transition-colors">
                Skapa en ny tipsrunda och bjud in andra att delta
              </p>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 to-indigo-500/0 group-hover:from-indigo-500/10 group-hover:to-transparent transition-all duration-300" />
          </button>
        </div>


        {/* Info-sektion */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-400">
            {isAuthenticated ? (
              <>Dina rundor och framsteg sparas automatiskt i ditt konto</>
            ) : (
              <>Du kan spela utan konto, men skapa ett konto för att spara dina rundor mellan enheter</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;


