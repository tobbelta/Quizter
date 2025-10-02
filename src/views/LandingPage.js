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
  const [isBetaExpanded, setIsBetaExpanded] = React.useState(false);

  const handleStartRun = () => {
    navigate('/join');
  };

  const handleCreateRun = () => {
    // Alla användare kan skapa rundor
    navigate('/generate');
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="RouteQuest" />

      <div className="mx-auto max-w-4xl px-4 py-16 pt-24">
        {/* Beta-notis - Kollapsbar */}
        <div className="mb-8 rounded-xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-900/20 to-slate-900/40 overflow-hidden">
          <button
            onClick={() => setIsBetaExpanded(!isBetaExpanded)}
            className="w-full flex items-center justify-between p-4 hover:bg-amber-900/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="text-2xl">⚠️</div>
              <h3 className="text-lg font-bold text-amber-300">
                OBS! Beta-version
              </h3>
            </div>
            <div className="text-amber-300 text-xl transition-transform" style={{ transform: isBetaExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              ▼
            </div>
          </button>

          {isBetaExpanded && (
            <div className="px-4 pb-4 pt-2 border-t border-amber-500/20">
              <p className="text-sm text-gray-300 mb-3">
                RouteQuest är just nu i beta. Vi arbetar kontinuerligt med att förbättra appen och värdesätter din feedback!
              </p>
              <p className="text-sm text-gray-300 mb-3">
                Alla donationer tas tacksamt emot och hjälper oss att utveckla tjänsten. Om appen inte lever upp till dina förväntningar, kontakta oss på{' '}
                <a
                  href="mailto:info@routequest.se"
                  className="text-cyan-400 hover:text-cyan-300 underline transition-colors"
                >
                  info@routequest.se
                </a>
                {' '}så kan vi diskutera en återbetalning.
              </p>
              <p className="text-xs text-gray-400 italic">
                Tack för att du testar RouteQuest och hjälper oss att göra den bättre!
              </p>
            </div>
          )}
        </div>

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
        <div className="mt-8 text-center">
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


