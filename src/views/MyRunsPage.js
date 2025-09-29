/**
 * Sida där inloggade administratörer kan se sina skapade rundor.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { runService } from '../services/runService';

const MyRunsPage = () => {
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useAuth();
  const [myRuns, setMyRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin || !currentUser) {
      navigate('/');
      return;
    }

    const loadMyRuns = () => {
      try {
        const allRuns = runService.listRuns();
        const filteredRuns = allRuns.filter(run =>
          run.createdBy === currentUser.id ||
          run.createdByName === currentUser.name
        );

        // Sortera med nyaste först
        const sortedRuns = filteredRuns.sort((a, b) =>
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
  }, [currentUser, isAdmin, navigate]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-gray-100 p-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-lg">Laddar dina rundor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Mina rundor</h1>
              <p className="text-gray-300">
                Översikt över rundor du har skapat som administratör
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/admin/create')}
                className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-medium"
              >
                Skapa ny runda
              </button>
              <button
                onClick={() => navigate('/generate')}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-medium"
              >
                Generera runda
              </button>
              <button
                onClick={() => navigate('/')}
                className="bg-slate-600 hover:bg-slate-700 px-4 py-2 rounded font-medium"
              >
                Tillbaka
              </button>
            </div>
          </div>
        </header>

        {myRuns.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-4">
              Du har inte skapat några rundor än
            </div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => navigate('/admin/create')}
                className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded font-medium"
              >
                Skapa din första runda
              </button>
              <button
                onClick={() => navigate('/generate')}
                className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded font-medium"
              >
                Generera en runda
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {myRuns.map((run) => (
              <div
                key={run.id}
                className="bg-slate-800 border border-slate-600 rounded-lg p-6 hover:bg-slate-750 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-white truncate">
                    {run.name || 'Namnlös runda'}
                  </h3>
                  <span className={`text-sm font-medium ${getStatusColor(run.status)}`}>
                    {getStatusLabel(run.status)}
                  </span>
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
                    <span>{run.lengthMeters ? `${Math.round(run.lengthMeters/1000)} km` : 'Okänd'}</span>
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
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <div className="text-sm text-gray-500">
            Totalt {myRuns.length} rundor skapade
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyRunsPage;