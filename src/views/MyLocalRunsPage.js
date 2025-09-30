/**
 * MyLocalRunsPage - Visar alla rundor för oinloggade/inloggade användare
 * Hämtar ID:n från localStorage och laddar full data från Firebase
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { localStorageService } from '../services/localStorageService';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../firebaseClient';
import Header from '../components/layout/Header';

const writeActiveParticipant = (payload) => {
  if (typeof window === 'undefined') return;
  try {
    if (!payload) {
      window.localStorage.removeItem('tipspromenad:activeParticipant');
    } else {
      window.localStorage.setItem('tipspromenad:activeParticipant', JSON.stringify(payload));
    }
  } catch (error) {
    console.warn('[MyLocalRunsPage] Kunde inte skriva aktiv deltagare till localStorage:', error);
  }
};

const MyLocalRunsPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // State för laddade rundor
  const [createdRuns, setCreatedRuns] = useState([]);
  const [joinedRuns, setJoinedRuns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Hämta run data från Firebase baserat på ID
  const fetchRunData = async (runId) => {
    try {
      const db = getFirebaseDb();
      const runRef = doc(db, 'runs', runId);
      const runSnap = await getDoc(runRef);
      if (runSnap.exists()) {
        return { id: runSnap.id, ...runSnap.data() };
      }
      return null;
    } catch (err) {
      console.error(`Kunde inte hämta run ${runId}:`, err);
      return null;
    }
  };

  // Ladda alla rundor
  useEffect(() => {
    const loadRuns = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Hämta ID:n från localStorage
        const localCreated = localStorageService.getCreatedRuns();
        const localJoined = localStorageService.getJoinedRuns();

        // Hämta full data från Firebase för skapade rundor
        const createdPromises = localCreated.map(async (item) => {
          const runData = await fetchRunData(item.runId);
          return runData ? { ...runData, createdAt: item.createdAt, updatedAt: item.updatedAt } : null;
        });

        // Hämta full data från Firebase för deltagna rundor
        const joinedPromises = localJoined.map(async (item) => {
          const runData = await fetchRunData(item.runId);
          return runData ? {
            runId: item.runId,
            runName: runData.name,
            runData,
            joinedAt: item.joinedAt,
            updatedAt: item.updatedAt,
            participantId: item.participantId
          } : null;
        });

        const [created, joined] = await Promise.all([
          Promise.all(createdPromises),
          Promise.all(joinedPromises)
        ]);

        // Filtrera bort null-värden (rundor som inte kunde laddas)
        setCreatedRuns(created.filter(Boolean));
        setJoinedRuns(joined.filter(Boolean));
      } catch (err) {
        console.error('Kunde inte ladda rundor:', err);
        setError('Kunde inte ladda dina rundor');
      } finally {
        setIsLoading(false);
      }
    };

    loadRuns();
  }, []);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Okänt datum';
    const date = new Date(timestamp);
    return date.toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleRunClick = (run) => {
    navigate(`/run/${run.id}/admin`);
  };

  const handleJoinedRunClick = (runId, participantId) => {
    writeActiveParticipant({ runId, participantId });
    navigate(`/run/${runId}/play`);
  };

  const hasAnyRuns = createdRuns.length > 0 || joinedRuns.length > 0;

  return (
    <div className="min-h-screen bg-slate-950">
      <Header />

      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Mina rundor</h1>
          <p className="text-gray-300">
            {isAuthenticated
              ? 'Dina sparade rundor från det här kontot'
              : 'Rundor sparade lokalt på denna enhet'}
          </p>
        </header>

        {isLoading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mb-4"></div>
            <p className="text-gray-300">Laddar dina rundor...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 text-red-200 mb-6">
            {error}
          </div>
        )}

        {!isLoading && !hasAnyRuns && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎯</div>
            <h2 className="text-xl font-semibold text-gray-300 mb-2">
              Inga rundor än
            </h2>
            <p className="text-gray-400 mb-6">
              Du har inte skapat eller deltagit i några rundor ännu
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => navigate('/join')}
                className="px-6 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-semibold transition-colors"
              >
                Anslut till runda
              </button>
              <button
                onClick={() => navigate('/generate')}
                className="px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-black font-semibold transition-colors"
              >
                Skapa runda
              </button>
            </div>
          </div>
        )}

        {/* Skapade rundor */}
        {!isLoading && createdRuns.length > 0 && (
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>✨</span>
              <span>Skapade rundor</span>
              <span className="text-sm font-normal text-gray-400">
                ({createdRuns.length})
              </span>
            </h2>

            <div className="space-y-3">
              {createdRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => handleRunClick(run)}
                  className="w-full text-left bg-slate-900/60 border border-slate-700 hover:border-indigo-500/50 rounded-lg p-4 transition-all hover:shadow-lg hover:shadow-indigo-500/10"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg text-gray-200 mb-1">
                        {run.name || 'Namnlös runda'}
                      </h3>
                      <p className="text-sm text-gray-400 mb-2">
                        {run.description || 'Ingen beskrivning'}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="px-2 py-1 bg-slate-800 rounded text-gray-300">
                          Skapad: {formatDate(run.createdAt)}
                        </span>
                        {run.status && (
                          <span className={`px-2 py-1 rounded ${
                            run.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                              : 'bg-slate-800 text-gray-300'
                          }`}>
                            {run.status === 'active' ? 'Aktiv' : run.status}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-gray-400">
                      →
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Deltagna rundor */}
        {!isLoading && joinedRuns.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>🎯</span>
              <span>Deltagna rundor</span>
              <span className="text-sm font-normal text-gray-400">
                ({joinedRuns.length})
              </span>
            </h2>

            <div className="space-y-3">
              {joinedRuns.map((joined) => (
                <button
                  key={joined.runId}
                  onClick={() => handleJoinedRunClick(joined.runId, joined.participantId)}
                  className="w-full text-left bg-slate-900/60 border border-slate-700 hover:border-cyan-500/50 rounded-lg p-4 transition-all hover:shadow-lg hover:shadow-cyan-500/10"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg text-gray-200 mb-1">
                        {joined.runName || 'Namnlös runda'}
                      </h3>
                      <div className="flex flex-wrap gap-2 text-xs mb-2">
                        <span className="px-2 py-1 bg-slate-800 rounded text-gray-300">
                          Anslöt: {formatDate(joined.joinedAt)}
                        </span>
                        {joined.participantData?.score !== undefined && (
                          <span className="px-2 py-1 bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 rounded">
                            Poäng: {joined.participantData.score}
                          </span>
                        )}
                      </div>
                      {joined.participantData?.alias && (
                        <p className="text-sm text-gray-400">
                          Som: {joined.participantData.alias}
                        </p>
                      )}
                    </div>
                    <div className="text-gray-400">
                      →
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Info om lokal lagring */}
        {!isAuthenticated && hasAnyRuns && (
          <div className="mt-8 bg-amber-900/20 border border-amber-500/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">💡</span>
              <div>
                <h3 className="font-semibold text-amber-200 mb-1">
                  Skapa konto för att spara mellan enheter
                </h3>
                <p className="text-sm text-amber-100 mb-3">
                  Dina rundor sparas just nu lokalt på den här enheten.
                  Skapa ett konto för att komma åt dem från andra enheter.
                </p>
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-semibold text-sm transition-colors"
                >
                  Skapa konto / Logga in
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyLocalRunsPage;