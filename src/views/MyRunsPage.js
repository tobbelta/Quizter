/**
 * Sida där inloggade administratörer och anonyma användare kan se sina skapade rundor.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRun } from '../context/RunContext';
import { runRepository } from '../repositories/runRepository';
import { localStorageService } from '../services/localStorageService';
import Header from '../components/layout/Header';
import Pagination from '../components/shared/Pagination';
import MessageDialog from '../components/shared/MessageDialog';
import { runSessionService } from '../services/runSessionService';

const MyRunsPage = () => {
  const navigate = useNavigate();
  const { currentUser, isAuthenticated } = useAuth();
  const { attachToRun } = useRun();
  const [myRuns, setMyRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRuns, setSelectedRuns] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [joinedRuns, setJoinedRuns] = useState(() => localStorageService.getJoinedRuns());
  const [participantsByRunId, setParticipantsByRunId] = useState({});
  const [, setStatusTick] = useState(0);

  useEffect(() => {
    const loadMyRuns = async () => {
      setLoading(true);
      try {
        let runs = [];
        const localRunsMeta = localStorageService.getCreatedRuns();
        const localRunIds = localRunsMeta.map(r => r.runId);
        const useLocalOnly = !isAuthenticated || !currentUser || currentUser.isAnonymous;

        if (!useLocalOnly && currentUser) {
          const allRuns = await runRepository.listRuns();
          runs = allRuns.filter(run =>
            run.createdBy === currentUser.id ||
            run.createdByName === currentUser.name ||
            run.createdByName === currentUser.email
          );
        }

        if (localRunIds.length > 0) {
          const localRuns = await runRepository.listRunsByIds(localRunIds);

          // Om färre rundor hittades än förväntat, rensa localStorage
          if (localRuns.length < localRunIds.length) {
            const missingIds = localRunIds.filter(id => !localRuns.some(r => r.id === id));
            if (missingIds.length > 0) {
              const validRuns = localRunsMeta.filter(r => !missingIds.includes(r.runId));
              localStorage.setItem('quizter:local:createdRuns', JSON.stringify(validRuns));
            }
          }

          if (useLocalOnly) {
            runs = localRuns;
          } else {
            const seen = new Set(runs.map(run => run.id));
            localRuns.forEach((run) => {
              if (!seen.has(run.id)) {
                runs.push(run);
              }
            });
          }
        }

        const sortedRuns = runs.sort((a, b) =>
          new Date(b.createdAt) - new Date(a.createdAt)
        );

        setMyRuns(sortedRuns);
        setJoinedRuns(localStorageService.getJoinedRuns());
      } catch (error) {
        console.error('Kunde inte ladda rundor:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMyRuns();
  }, [currentUser, isAuthenticated]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleStorage = (event) => {
      if (!event.key || event.key === 'quizter:local:joinedRuns') {
        setJoinedRuns(localStorageService.getJoinedRuns());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const intervalId = window.setInterval(() => {
      setStatusTick((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const refreshRunProgress = async (runs) => {
    const joined = localStorageService.getJoinedRuns();
    const joinedByRunId = new Map(joined.map((entry) => [entry.runId, entry]));
    const activeRuns = runs.filter((run) => run.status === 'active' && joinedByRunId.has(run.id));
    if (activeRuns.length === 0) {
      setParticipantsByRunId({});
      return;
    }

    const results = await Promise.allSettled(activeRuns.map(async (run) => {
      const entry = joinedByRunId.get(run.id);
      if (!entry?.participantId) return null;
      const participant = await runRepository.getParticipant(run.id, entry.participantId);
      return { runId: run.id, participant };
    }));

    const nextByRunId = {};
    results.forEach((result) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      nextByRunId[result.value.runId] = result.value.participant;
    });

    setParticipantsByRunId(nextByRunId);
  };

  useEffect(() => {
    if (myRuns.length === 0) return undefined;
    refreshRunProgress(myRuns);
    const intervalId = window.setInterval(() => {
      refreshRunProgress(myRuns);
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [myRuns]);

  const handleToggleRun = (runId) => {
    setSelectedRuns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(runId)) {
        newSet.delete(runId);
      } else {
        newSet.add(runId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedRuns.size === myRuns.length) {
      setSelectedRuns(new Set());
    } else {
      setSelectedRuns(new Set(myRuns.map(r => r.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedRuns.size === 0) return;

    if (!window.confirm(`Är du säker på att du vill radera ${selectedRuns.size} runda(r)?`)) {
      return;
    }

    try {
      // Ta bort från API om användaren är inloggad
      if (isAuthenticated) {
        const deletePromises = Array.from(selectedRuns).map(runId =>
          runRepository.deleteRun(runId)
        );
        await Promise.all(deletePromises);
      }

      // Ta bort från localStorage
      const localRunsMeta = localStorageService.getCreatedRuns();
      const updatedLocalRuns = localRunsMeta.filter(r => !selectedRuns.has(r.runId));
      localStorage.setItem('quizter:local:createdRuns', JSON.stringify(updatedLocalRuns));

      // Uppdatera UI
      setMyRuns(prev => prev.filter(r => !selectedRuns.has(r.id)));
      setSelectedRuns(new Set());
    } catch (error) {
      console.error('Kunde inte radera rundor:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Kunde inte radera rundor',
        message: 'Kunde inte radera alla rundor. Se konsolen för detaljer.',
        type: 'error'
      });
    }
  };

  const handleContinueRun = async (runId, participantId, joinCode) => {
    if (!runId || !participantId) return;
    try {
      await attachToRun(runId, participantId);
      navigate(`/run/${runId}/play`);
    } catch (error) {
      console.warn('[MyRuns] Kunde inte återansluta till runda:', error);
      localStorageService.removeJoinedRun(runId);
      if (joinCode) {
        navigate(`/join?code=${joinCode}`);
      }
    }
  };

  const handleDeleteRun = async (runId) => {
    if (!window.confirm('Är du säker på att du vill radera denna runda?')) {
      return;
    }

    try {
      // Ta bort från API om användaren är inloggad
      if (isAuthenticated) {
        await runRepository.deleteRun(runId);
      }

      // Ta bort från localStorage
      const localRunsMeta = localStorageService.getCreatedRuns();
      const updatedLocalRuns = localRunsMeta.filter(r => r.runId !== runId);
      localStorage.setItem('quizter:local:createdRuns', JSON.stringify(updatedLocalRuns));

      // Uppdatera UI
      setMyRuns(prev => prev.filter(r => r.id !== runId));
    } catch (error) {
      console.error('Kunde inte radera runda:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Kunde inte radera runda',
        message: 'Kunde inte radera rundan. Se konsolen för detaljer.',
        type: 'error'
      });
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Okänt datum';
    try {
      return new Date(dateString).toLocaleDateString('sv-SE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Okänt datum';
    }
  };

  const formatCountdown = (ms) => {
    if (!Number.isFinite(ms) || ms <= 0) {
      return '0:00';
    }
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatDistance = (meters) => {
    if (!Number.isFinite(meters)) return 'okänt';
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.max(0, Math.round(meters))} m`;
  };

  const getTotalQuestions = (run) => {
    return run.questionCount || run.questionIds?.length || run.checkpoints?.length || 0;
  };

  const getCurrentOrderIndex = (participant) => {
    if (!participant) return 0;
    const answeredCount = Array.isArray(participant.answers) ? participant.answers.length : 0;
    const fallbackOrder = Math.max(1, answeredCount + 1);
    const rawOrder = Number.isFinite(participant.currentOrder)
      ? participant.currentOrder
      : fallbackOrder;
    return Math.max(0, rawOrder - 1);
  };

  const getVisibilityState = (runId, participantId) => {
    if (typeof window === 'undefined' || !runId || !participantId) return null;
    try {
      const raw = localStorage.getItem(`quizter:questionVisible:${runId}:${participantId}`);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  };

  const getTimeBasedStatus = (run, participant) => {
    if (!run || !participant) return null;
    const total = getTotalQuestions(run);
    const answered = Array.isArray(participant.answers) ? participant.answers.length : 0;
    const remaining = Math.max(0, total - answered);
    const currentIndex = getCurrentOrderIndex(participant);
    const visibility = getVisibilityState(run.id, participant.id);
    if (visibility?.visible && visibility.questionIndex === currentIndex) {
      return {
        summary: 'Fråga tillgänglig',
        answered,
        remaining
      };
    }

    const timerKeyPrefix = `timeQuestionTrigger:${run.id}:${participant.id}`;
    const timerKey = `${timerKeyPrefix}:q${currentIndex}`;
    const rawTarget = localStorage.getItem(timerKey);
    if (!rawTarget) {
      return {
        summary: 'Väntar på nästa fråga',
        answered,
        remaining
      };
    }

    const target = Number(rawTarget);
    const remainingMs = Number.isFinite(target) ? target - Date.now() : null;
    if (!Number.isFinite(remainingMs)) {
      return {
        summary: 'Väntar på nästa fråga',
        answered,
        remaining
      };
    }
    if (remainingMs <= 0) {
      return {
        summary: 'Fråga tillgänglig',
        answered,
        remaining
      };
    }

    return {
      summary: `Nästa fråga om ${formatCountdown(remainingMs)}`,
      answered,
      remaining
    };
  };

  const getDistanceBasedStatus = (run, participant) => {
    if (!run || !participant) return null;
    const total = getTotalQuestions(run);
    const answered = Array.isArray(participant.answers) ? participant.answers.length : 0;
    const remaining = Math.max(0, total - answered);
    const currentIndex = getCurrentOrderIndex(participant);
    const visibility = getVisibilityState(run.id, participant.id);
    if (visibility?.visible && visibility.questionIndex === currentIndex) {
      return {
        summary: 'Fråga tillgänglig',
        answered,
        remaining
      };
    }

    const distanceKey = `distanceTracking:${run.id}:${participant.id}:distance`;
    try {
      const raw = localStorage.getItem(distanceKey);
      const data = raw ? JSON.parse(raw) : null;
      const questionDistance = Number(data?.questionDistance || 0);
      const interval = Number(run.distanceBetweenQuestions || 0);
      if (!Number.isFinite(interval) || interval <= 0) {
        return {
          summary: 'Väntar på nästa fråga',
          answered,
          remaining
        };
      }
      const remainingDistance = Math.max(0, interval - questionDistance);
      if (remainingDistance <= 0) {
        return {
          summary: 'Fråga tillgänglig',
          answered,
          remaining
        };
      }
      return {
        summary: `Nästa fråga om ${formatDistance(remainingDistance)}`,
        answered,
        remaining
      };
    } catch (error) {
      return {
        summary: 'Väntar på nästa fråga',
        answered,
        remaining
      };
    }
  };

  const getRouteBasedStatus = (run, participant) => {
    if (!run || !participant) return null;
    const total = getTotalQuestions(run);
    const answered = Array.isArray(participant.answers) ? participant.answers.length : 0;
    const remaining = Math.max(0, total - answered);
    const currentIndex = getCurrentOrderIndex(participant);
    const visibility = getVisibilityState(run.id, participant.id);
    if (visibility?.visible && visibility.questionIndex === currentIndex) {
      return {
        summary: 'Fråga tillgänglig',
        answered,
        remaining
      };
    }

    return {
      summary: `Nästa kontrollpunkt ${Math.min(currentIndex + 1, total)}/${total}`,
      answered,
      remaining
    };
  };

  const statusForRun = (() => {
    const joinedByRunId = new Map(joinedRuns.map((entry) => [entry.runId, entry]));
    const statuses = {};
    myRuns.forEach((run) => {
      const entry = joinedByRunId.get(run.id);
      const participant = entry?.participantId ? participantsByRunId[run.id] : null;
      if (!participant || run.status !== 'active') return;

      const isActiveInstance = Boolean(runSessionService.getActiveInstance(run.id));
      const total = getTotalQuestions(run);
      const answered = Array.isArray(participant.answers) ? participant.answers.length : 0;
      const remaining = Math.max(0, total - answered);

      if (!isActiveInstance) {
        statuses[run.id] = {
          summary: 'Pausad (ingen aktiv spelvy)',
          answered,
          remaining
        };
        return;
      }

      if (run.type === 'time-based') {
        statuses[run.id] = getTimeBasedStatus(run, participant);
      } else if (run.type === 'distance-based') {
        statuses[run.id] = getDistanceBasedStatus(run, participant);
      } else {
        statuses[run.id] = getRouteBasedStatus(run, participant);
      }
    });
    return statuses;
  })();

  const getTypeLabel = (type) => {
    switch (type) {
      case 'hosted': return 'Administrerad';
      case 'generated': return 'Auto-genererad';
      case 'route-based': return 'Rutt-baserad';
      case 'distance-based': return 'Distans-baserad';
      case 'time-based': return 'Tids-baserad';
      default: return type || 'Okänd';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active': return 'Aktiv';
      case 'completed': return 'Avslutad';
      case 'draft': return 'Utkast';
      default: return status || 'Okänd';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'text-green-400';
      case 'completed': return 'text-gray-400';
      case 'draft': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  // Paginering
  const totalPages = Math.ceil(myRuns.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRuns = myRuns.slice(startIndex, endIndex);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <Header title="Mina rundor" />
        <div className="max-w-4xl mx-auto text-center pt-24 px-4">
          <div className="text-lg text-gray-100">Laddar dina rundor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="Mina rundor" />
      <div className="max-w-6xl mx-auto pt-24 px-4 pb-8">
        {myRuns.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-300 text-lg mb-4">
              Du har inte skapat några rundor än
            </div>
            <button
              onClick={() => navigate('/generate')}
              className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded font-medium text-white"
            >
              Generera din första runda
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/generate')}
                  className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-medium text-white"
                >
                  Generera runda
                </button>
                <button
                  onClick={handleSelectAll}
                  className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded font-medium text-white"
                >
                  {selectedRuns.size === myRuns.length ? 'Avmarkera alla' : 'Markera alla'}
                </button>
                {selectedRuns.size > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    className="bg-red-500 hover:bg-red-400 px-4 py-2 rounded font-medium text-white"
                  >
                    Radera markerade ({selectedRuns.size})
                  </button>
                )}
              </div>
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              totalItems={myRuns.length}
              onItemsPerPageChange={setItemsPerPage}
            />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {paginatedRuns.map((run) => {
              const joinedEntry = joinedRuns.find((entry) => entry.runId === run.id && entry.participantId);
              const runStatus = statusForRun[run.id];
              return (
              <div
                key={run.id}
                className={`bg-slate-800 border rounded-lg p-6 hover:bg-slate-750 transition-colors ${
                  selectedRuns.has(run.id) ? 'border-cyan-500' : 'border-slate-600'
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <input
                    type="checkbox"
                    checked={selectedRuns.has(run.id)}
                    onChange={() => handleToggleRun(run.id)}
                    className="mt-1 w-5 h-5 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-lg font-semibold text-white truncate">
                        {run.name || 'Namnlös runda'}
                      </h3>
                      <span className={`text-sm font-medium ${getStatusColor(run.status)}`}>
                        {getStatusLabel(run.status)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-sm text-gray-300 space-y-2 mb-4">
                  <div className="flex justify-between">
                    <span>Typ:</span>
                    <span>{getTypeLabel(run.type)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Skapad:</span>
                    <span>{formatDate(run.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Frågor:</span>
                    <span>{getTotalQuestions(run)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Längd:</span>
                    <span>
                      {run.type === 'distance-based' 
                        ? `${run.distanceBetweenQuestions || 500}m mellan frågor`
                        : run.type === 'time-based'
                          ? `${run.minutesBetweenQuestions || 5} min mellan frågor`
                          : run.lengthMeters 
                            ? `${Math.round(run.lengthMeters/1000)} km`
                            : 'Okänd'
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kod:</span>
                    <span className="font-mono text-purple-300">{run.joinCode || 'Ingen'}</span>
                  </div>
                </div>

                {run.status === 'active' && (
                  <div className="mb-4 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-gray-200">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Status</span>
                      <span>Live</span>
                    </div>
                    {runStatus ? (
                      <>
                        <div className="mt-1 font-semibold text-emerald-300">
                          {runStatus.summary}
                        </div>
                        <div className="mt-1 text-xs text-gray-300">
                          {`Svarade ${runStatus.answered}/${getTotalQuestions(run)} · Kvar ${runStatus.remaining}`}
                        </div>
                      </>
                    ) : (
                      <div className="mt-1 text-xs text-gray-400">
                        Anslut för att se status.
                      </div>
                    )}
                  </div>
                )}

                {run.description && (
                  <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                    {run.description}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {joinedEntry ? (
                    <button
                      onClick={() => handleContinueRun(run.id, joinedEntry.participantId, run.joinCode)}
                      className="flex-1 bg-cyan-500 hover:bg-cyan-400 px-3 py-2 rounded text-sm font-medium text-black"
                    >
                      Fortsätt
                    </button>
                  ) : run.status === 'active' ? (
                    <button
                      onClick={() => navigate(`/join?code=${run.joinCode || ''}`)}
                      disabled={!run.joinCode}
                      className="flex-1 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-600 px-3 py-2 rounded text-sm font-medium text-black"
                    >
                      Anslut
                    </button>
                  ) : null}
                  <button
                    onClick={() => navigate(`/run/${run.id}/admin`)}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 px-3 py-2 rounded text-sm font-medium"
                  >
                    Administrera
                  </button>
                  <button
                    onClick={() => navigate(`/run/${run.id}/results`)}
                    className="flex-1 bg-slate-600 hover:bg-slate-700 px-3 py-2 rounded text-sm font-medium"
                  >
                    Resultat
                  </button>
                  <button
                    onClick={() => handleDeleteRun(run.id)}
                    className="bg-red-500 hover:bg-red-400 px-3 py-2 rounded text-sm font-medium"
                    title="Radera runda"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
            })}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              totalItems={myRuns.length}
              onItemsPerPageChange={setItemsPerPage}
            />
          </>
        )}
      </div>

      <MessageDialog
        isOpen={dialogConfig.isOpen}
        onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
      />
    </div>
  );
};

export default MyRunsPage;
