/**
 * Sida där inloggade administratörer och anonyma användare kan se sina skapade rundor.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { runRepository } from '../repositories/runRepository';
import { localStorageService } from '../services/localStorageService';
import Header from '../components/layout/Header';
import Pagination from '../components/shared/Pagination';
import MessageDialog from '../components/shared/MessageDialog';

const MyRunsPage = () => {
  const navigate = useNavigate();
  const { currentUser, isAuthenticated } = useAuth();
  const [myRuns, setMyRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRuns, setSelectedRuns] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    const loadMyRuns = async () => {
      setLoading(true);
      try {
        let runs = [];

        // Om användaren är inloggad, hämta rundor från Firestore
        if (isAuthenticated && currentUser) {
          const allRuns = await runRepository.listRuns();
          runs = allRuns.filter(run =>
            run.createdBy === currentUser.id ||
            run.createdByName === currentUser.name
          );
        } else {
          // Om ej inloggad, hämta lokala rundor från localStorage
          const localRunsMeta = localStorageService.getCreatedRuns();
          const localRunIds = localRunsMeta.map(r => r.runId);

          if (localRunIds.length > 0) {
            runs = await runRepository.listRunsByIds(localRunIds);

            // Om färre rundor hittades än förväntat, rensa localStorage
            if (runs.length < localRunIds.length) {
              console.warn('[MyRunsPage] Varning: Hittade bara', runs.length, 'av', localRunIds.length, 'rundor i Firestore');
              const missingIds = localRunIds.filter(id => !runs.some(r => r.id === id));
              console.warn('[MyRunsPage] Saknade rundor:', missingIds);

              // Rensa bort ogiltiga rundor från localStorage
              if (missingIds.length > 0) {
                const validRuns = localRunsMeta.filter(r => !missingIds.includes(r.runId));
                localStorage.setItem('geoquest:local:createdRuns', JSON.stringify(validRuns));
              }
            }
          }
        }

        const sortedRuns = runs.sort((a, b) =>
          new Date(b.createdAt) - new Date(a.createdAt)
        );

        setMyRuns(sortedRuns);
      } catch (error) {
        console.error('Kunde inte ladda rundor:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMyRuns();
  }, [currentUser, isAuthenticated]);

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
      // Ta bort från Firestore om användaren är inloggad
      if (isAuthenticated) {
        const deletePromises = Array.from(selectedRuns).map(runId =>
          runRepository.deleteRun(runId)
        );
        await Promise.all(deletePromises);
      }

      // Ta bort från localStorage
      const localRunsMeta = localStorageService.getCreatedRuns();
      const updatedLocalRuns = localRunsMeta.filter(r => !selectedRuns.has(r.runId));
      localStorage.setItem('geoquest:local:createdRuns', JSON.stringify(updatedLocalRuns));

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

  const handleDeleteRun = async (runId) => {
    if (!window.confirm('Är du säker på att du vill radera denna runda?')) {
      return;
    }

    try {
      // Ta bort från Firestore om användaren är inloggad
      if (isAuthenticated) {
        await runRepository.deleteRun(runId);
      }

      // Ta bort från localStorage
      const localRunsMeta = localStorageService.getCreatedRuns();
      const updatedLocalRuns = localRunsMeta.filter(r => r.runId !== runId);
      localStorage.setItem('geoquest:local:createdRuns', JSON.stringify(updatedLocalRuns));

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
            {paginatedRuns.map((run) => (
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
                    <span>{run.questionCount || run.checkpoints?.length || 0}</span>
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

                {run.description && (
                  <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                    {run.description}
                  </p>
                )}

                <div className="flex gap-2">
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
            ))}
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
