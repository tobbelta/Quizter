/**
 * SuperUser-sida för att visa och hantera alla rundor
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { runRepository } from '../repositories/runRepository';
import Header from '../components/layout/Header';
import MessageDialog from '../components/shared/MessageDialog';

const SuperUserAllRunsPage = () => {
  const navigate = useNavigate();
  const { isSuperUser } = useAuth();
  const [runs, setRuns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRuns, setSelectedRuns] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }

    const loadRuns = async () => {
      try {
        setIsLoading(true);
        const allRuns = await runRepository.listRuns();
        setRuns(allRuns || []);
      } catch (error) {
        console.error('Kunde inte ladda rundor:', error);
        setRuns([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadRuns();
  }, [isSuperUser, navigate]);

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
    if (selectedRuns.size === filteredRuns.length) {
      setSelectedRuns(new Set());
    } else {
      setSelectedRuns(new Set(filteredRuns.map(r => r.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedRuns.size === 0) return;

    if (!window.confirm(`Är du säker på att du vill radera ${selectedRuns.size} runda(r)?`)) {
      return;
    }

    try {
      const deletePromises = Array.from(selectedRuns).map(runId =>
        runRepository.deleteRun(runId)
      );
      await Promise.all(deletePromises);

      setRuns(prev => prev.filter(r => !selectedRuns.has(r.id)));
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

  const filteredRuns = runs.filter(run => {
    const matchesSearch =
      run.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      run.createdByName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      run.joinCode?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  if (!isSuperUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="Alla rundor" />

      <div className="mx-auto max-w-6xl px-4 pt-24 pb-8">
        <div className="mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          <input
            type="text"
            placeholder="Sök rundor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-96 rounded bg-slate-800 border border-slate-600 px-4 py-2 text-gray-200"
          />

          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              className="rounded bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600"
            >
              {selectedRuns.size === filteredRuns.length ? 'Avmarkera alla' : 'Markera alla'}
            </button>

            {selectedRuns.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="rounded bg-red-500 px-4 py-2 font-semibold text-white hover:bg-red-400"
              >
                Radera markerade ({selectedRuns.size})
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Laddar rundor...</div>
        ) : filteredRuns.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Inga rundor hittades</div>
        ) : (
          <div className="space-y-2">
            {filteredRuns.map(run => (
              <div
                key={run.id}
                className={`rounded-lg border p-4 transition-colors ${
                  selectedRuns.has(run.id)
                    ? 'border-cyan-500 bg-cyan-900/20'
                    : 'border-slate-700 bg-slate-900/60'
                }`}
              >
                <div className="flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={selectedRuns.has(run.id)}
                    onChange={() => handleToggleRun(run.id)}
                    className="mt-1 w-5 h-5 rounded"
                  />

                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold text-gray-200">{run.name}</h3>
                      <span className="px-3 py-1 bg-slate-800 rounded text-sm font-mono text-cyan-300">
                        {run.joinCode}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-400">
                      <div>
                        <span className="font-semibold">Skapare:</span> {run.createdByName || 'Anonym'}
                      </div>
                      <div>
                        <span className="font-semibold">Längd:</span> {
                          run.type === 'distance-based' 
                            ? `${run.distanceBetweenQuestions || 500}m mellan frågor`
                            : run.type === 'time-based'
                              ? `${run.minutesBetweenQuestions || 5} min mellan frågor`
                              : `${run.lengthMeters || 0}m`
                        }
                      </div>
                      <div>
                        <span className="font-semibold">Frågor:</span> {run.questionCount || run.checkpoints?.length || 0}
                      </div>
                      <div>
                        <span className="font-semibold">Svårighet:</span> {run.difficulty || 'N/A'}
                      </div>
                    </div>

                    {run.createdAt && (
                      <div className="mt-2 text-xs text-gray-500">
                        Skapad: {new Date(run.createdAt).toLocaleString('sv-SE')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
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

export default SuperUserAllRunsPage;