/**
 * Första sidan användare möter – fokuserar på CTA för att skapa/ansluta rundor
 * och förklarar kort hur RouteQuest fungerar.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GPSPrompt from '../components/shared/GPSPrompt';
import PageLayout from '../components/layout/PageLayout';

const LandingPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [isBetaExpanded, setIsBetaExpanded] = useState(false);

  const handleStartRun = () => {
    navigate('/join');
  };

  const handleCreateRun = () => {
    navigate('/generate');
  };

  return (
    <PageLayout headerTitle="RouteQuest" maxWidth="max-w-3xl" className="space-y-8">
      <section className="space-y-6 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-slate-100 sm:text-4xl">
            Välkommen till RouteQuest
          </h1>
          <p className="text-base text-gray-300 sm:text-lg">
            Skapa och spela digitala tipsrundor direkt i mobilen
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5">
        <button
          type="button"
          onClick={() => setIsBetaExpanded(!isBetaExpanded)}
          aria-expanded={isBetaExpanded}
          className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-amber-500/10 sm:px-6"
        >
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="text-xl">🚧</span>
            <div>
              <h2 className="text-base font-semibold text-amber-200 sm:text-lg">RouteQuest är i beta</h2>
              <p className="text-xs text-amber-100/80 sm:text-sm">Vi slipar upplevelsen och välkomnar din feedback.</p>
            </div>
          </div>
          <span aria-hidden="true" className={`text-amber-200 transition-transform ${isBetaExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>
        {isBetaExpanded && (
          <div className="space-y-3 border-t border-amber-500/20 px-4 py-4 text-sm text-amber-50 sm:px-6">
            <p>
              RouteQuest är under aktiv utveckling. Hör gärna av dig om du saknar funktioner eller
              hittar problem – varje synpunkt hjälper oss framåt.
            </p>
            <p>
              Donationer går direkt till drift och vidareutveckling. Är du inte nöjd? Mejla oss på
              {' '}
              <a href="mailto:info@routequest.se" className="text-cyan-300 underline hover:text-cyan-200">
                info@routequest.se
              </a>{' '}så hittar vi en lösning.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-6 text-center">

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleCreateRun}
            className="group flex flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-8 transition-all hover:border-cyan-400 hover:bg-slate-800/70"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-cyan-500/20 text-4xl transition-colors group-hover:bg-cyan-500/30">
              ✨
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Skapa runda</h2>
              <p className="mt-2 text-sm text-gray-400">
                Generera en ny tipspromenad automatiskt
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleStartRun}
            className="group flex flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-8 transition-all hover:border-purple-400 hover:bg-slate-800/70"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-purple-500/20 text-4xl transition-colors group-hover:bg-purple-500/30">
              🎯
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Anslut till runda</h2>
              <p className="mt-2 text-sm text-gray-400">
                Ange kod för att gå med i en befintlig runda
              </p>
            </div>
          </button>
        </div>
      </section>

      <section className="space-y-6 text-center">
        <h2 className="text-2xl font-semibold text-slate-100">Så fungerar det</h2>
        <div className="grid gap-4 text-left sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
            <div className="mb-3 text-3xl">📍</div>
            <h3 className="text-lg font-semibold text-slate-100">Automatisk ruttplanering</h3>
            <p className="mt-2 text-sm text-gray-400">
              Ange längd och svårighetsgrad så skapar vi en rutt med frågor automatiskt
            </p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
            <div className="mb-3 text-3xl">🗺️</div>
            <h3 className="text-lg font-semibold text-slate-100">Kartnavigering</h3>
            <p className="mt-2 text-sm text-gray-400">
              Följ kartan till varje kontrollpunkt och svara på frågor längs vägen
            </p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
            <div className="mb-3 text-3xl">🏆</div>
            <h3 className="text-lg font-semibold text-slate-100">Live resultat</h3>
            <p className="mt-2 text-sm text-gray-400">
              Följ poängen i realtid och se vem som ligger bäst till
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4 text-center">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
          <h2 className="text-xl font-semibold text-slate-100">Perfekt för alla tillfällen</h2>
          <p className="mt-3 text-gray-300">
            Använd RouteQuest för teambuilding, familjeaktiviteter, skolprojekt eller bara för att göra
            en promenad mer engagerande. Ingen installation behövs – allt fungerar direkt i webbläsaren.
          </p>
        </div>
        {!isAuthenticated && (
          <p className="text-sm text-gray-400">
            Kör som gäst eller skapa konto för att spara rundor mellan enheter
          </p>
        )}
      </section>

      {/* GPS-aktiverings prompt */}
      <GPSPrompt />
    </PageLayout>
  );
};

export default LandingPage;
