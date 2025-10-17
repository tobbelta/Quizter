import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import { useBackgroundTasks } from '../context/BackgroundTaskContext';
import MessageDialog from '../components/shared/MessageDialog';
import { useAuth } from '../context/AuthContext';
import { getFirebaseAuth } from '../firebaseClient';

const FINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const STATUS_LABELS = {
  queued: 'Köad',
  pending: 'Förbereds',
  processing: 'Pågår',
  completed: 'Klar',
  failed: 'Misslyckades',
  cancelled: 'Avbruten',
};

const STATUS_BADGES = {
  queued: 'bg-slate-700/70 text-slate-200',
  pending: 'bg-slate-700/70 text-slate-200',
  processing: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  completed: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30',
  failed: 'bg-red-500/20 text-red-300 border border-red-500/40',
  cancelled: 'bg-slate-600/30 text-slate-200 border border-slate-500/40',
};

const formatDateTime = (date) => {
  if (!date) return '—';
  try {
    return date.toLocaleString('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (error) {
    return date.toString();
  }
};

const toDuration = (start, end) => {
  if (!start || !end) return '—';
  const milliseconds = end.getTime() - start.getTime();
  if (Number.isNaN(milliseconds) || milliseconds < 0) return '—';
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remainder = seconds % 60;
    return `${minutes}m ${remainder}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return `${hours}h ${remainderMinutes}m`;
};

const SuperUserTasksPage = () => {
  const navigate = useNavigate();
  const { allTasks, refreshAllTasks } = useBackgroundTasks();
  const { currentUser } = useAuth();
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteResult, setDeleteResult] = useState(null);
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [migrationLoading, setMigrationLoading] = useState(false);

  const sortedTasks = useMemo(() => {
    if (!allTasks || allTasks.length === 0) {
      return [];
    }

    return [...allTasks].sort((a, b) => {
      const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      if (aTime !== bTime) {
        return bTime - aTime;
      }
      return a.id.localeCompare(b.id);
    });
  }, [allTasks]);

  const filteredTasks = useMemo(() => {
    return sortedTasks.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) {
        return false;
      }
      if (typeFilter !== 'all' && task.taskType !== typeFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const haystack = [
          task.id,
          task.userId,
          task.result?.provider,
          task.payload?.category,
          task.payload?.difficulty,
          task.error,
          task.taskType,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchTerm.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [sortedTasks, statusFilter, typeFilter, searchTerm]);

  const stats = useMemo(() => {
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    const initial = {
      total: allTasks.length,
      active: 0,
      completed: 0,
      failed: 0,
      queued: 0,
      last24hCompleted: 0,
    };

    return allTasks.reduce((acc, task) => {
      if (!FINAL_STATUSES.has(task.status)) {
        if (task.status === 'queued' || task.status === 'pending') {
          acc.queued += 1;
        }
        if (task.status === 'processing') {
          acc.active += 1;
        }
      } else if (task.status === 'completed') {
        acc.completed += 1;
        if (task.finishedAt && task.finishedAt.getTime() >= last24h) {
          acc.last24hCompleted += 1;
        }
      } else if (task.status === 'failed') {
        acc.failed += 1;
      }
      return acc;
    }, initial);
  }, [allTasks]);

  const handleCleanup = async () => {
    if (!window.confirm('Vill du städa hängande bakgrundsjobb (äldre än 30 minuter)?')) {
      return;
    }

    setCleanupLoading(true);
    setCleanupResult(null);

    try {
      const response = await fetch('https://europe-west1-geoquest2-7e45c.cloudfunctions.net/cleanupStuckTasks');
      const data = await response.json();

      if (response.ok) {
        setCleanupResult({
          success: true,
          message: `Städat ${data.cleaned} hängande jobb (${data.processingChecked} processing, ${data.queuedChecked} queued)`
        });
      } else {
        setCleanupResult({
          success: false,
          message: data.error || 'Något gick fel'
        });
      }
    } catch (error) {
      setCleanupResult({
        success: false,
        message: `Fel: ${error.message}`
      });
    } finally {
      setCleanupLoading(false);
      await refreshAllTasks();
      // Töm resultatet efter 5 sekunder
      setTimeout(() => setCleanupResult(null), 5000);
    }
  };

  const handleDeleteOldTasks = async () => {
    if (!window.confirm('Vill du ta bort alla gamla klara och misslyckade jobb (äldre än 24 timmar)?\n\nDetta går INTE att ångra!')) {
      return;
    }

    setDeleteLoading(true);
    setDeleteResult(null);

    try {
      const response = await fetch('https://europe-west1-geoquest2-7e45c.cloudfunctions.net/deleteOldTasks');
      const data = await response.json();

      if (response.ok) {
        setDeleteResult({
          success: true,
          message: `Raderat ${data.deleted} gamla jobb (${data.completedDeleted} klara, ${data.failedDeleted} misslyckade)`
        });
      } else {
        setDeleteResult({
          success: false,
          message: data.error || 'Något gick fel'
        });
      }
    } catch (error) {
      setDeleteResult({
        success: false,
        message: `Fel: ${error.message}`
      });
    } finally {
      setDeleteLoading(false);
      await refreshAllTasks();
      // Töm resultatet efter 5 sekunder
      setTimeout(() => setDeleteResult(null), 5000);
    }
  };

  const handleToggleTask = (taskId) => {
    setSelectedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const handleToggleAll = () => {
    if (selectedTasks.size === filteredTasks.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(filteredTasks.map(t => t.id)));
    }
  };

  const handleStopTask = async (taskId) => {
    if (!window.confirm('Vill du stoppa detta jobb?')) {
      return;
    }

    try {
      const response = await fetch('https://europe-west1-geoquest2-7e45c.cloudfunctions.net/stopTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      });
      const data = await response.json();

      if (response.ok) {
        setDialogConfig({
          isOpen: true,
          title: 'Jobb stoppat',
          message: `Jobb stoppat: ${data.message}`,
          type: 'success'
        });
      } else {
        setDialogConfig({
          isOpen: true,
          title: 'Kunde inte stoppa jobb',
          message: data.error || 'Okänt fel',
          type: 'error'
        });
      }
    } catch (error) {
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid stopp',
        message: error.message,
        type: 'error'
      });
    } finally {
      await refreshAllTasks();
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Vill du radera detta jobb permanent?\n\nDetta går INTE att ångra!')) {
      return;
    }

    try {
      const response = await fetch('https://europe-west1-geoquest2-7e45c.cloudfunctions.net/deleteTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      });
      const data = await response.json();

      if (response.ok) {
        setDialogConfig({
          isOpen: true,
          title: 'Jobb raderat',
          message: 'Jobb raderat!',
          type: 'success'
        });
      } else {
        setDialogConfig({
          isOpen: true,
          title: 'Kunde inte radera jobb',
          message: data.error || 'Okänt fel',
          type: 'error'
        });
      }
    } catch (error) {
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid radering',
        message: error.message,
        type: 'error'
      });
    } finally {
      setBulkActionLoading(false);
      await refreshAllTasks();
    }
  };

  const handleBulkStop = async () => {
    if (selectedTasks.size === 0) {
      setDialogConfig({
        isOpen: true,
        title: 'Ingen markering',
        message: 'Välj minst ett jobb att stoppa',
        type: 'warning'
      });
      return;
    }

    if (!window.confirm(`Vill du stoppa ${selectedTasks.size} valda jobb?`)) {
      return;
    }

    setBulkActionLoading(true);
    try {
      const taskIds = Array.from(selectedTasks);
      const response = await fetch('https://europe-west1-geoquest2-7e45c.cloudfunctions.net/bulkStopTasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds })
      });
      const data = await response.json();

      if (response.ok) {
        setDialogConfig({
          isOpen: true,
          title: 'Jobb stoppade',
          message: `Stoppat ${data.stopped} jobb`,
          type: 'success'
        });
        setSelectedTasks(new Set());
      } else {
        setDialogConfig({
          isOpen: true,
          title: 'Kunde inte stoppa jobb',
          message: data.error || 'Okänt fel',
          type: 'error'
        });
      }
    } catch (error) {
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid stopp',
        message: error.message,
        type: 'error'
      });
    } finally {
      setBulkActionLoading(false);
      await refreshAllTasks();
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTasks.size === 0) {
      setDialogConfig({
        isOpen: true,
        title: 'Ingen markering',
        message: 'Välj minst ett jobb att radera',
        type: 'warning'
      });
      return;
    }

    if (!window.confirm(`⚠️ VARNING: Vill du radera ${selectedTasks.size} valda jobb permanent?\n\nDetta går INTE att ångra!`)) {
      return;
    }

    setBulkActionLoading(true);
    try {
      const taskIds = Array.from(selectedTasks);
      const response = await fetch('https://europe-west1-geoquest2-7e45c.cloudfunctions.net/bulkDeleteTasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds })
      });
      const data = await response.json();

      if (response.ok) {
        setDialogConfig({
          isOpen: true,
          title: 'Jobb raderade',
          message: `Raderat ${data.deleted} jobb`,
          type: 'success'
        });
        setSelectedTasks(new Set());
      } else {
        setDialogConfig({
          isOpen: true,
          title: 'Kunde inte radera jobb',
          message: data.error || 'Okänt fel',
          type: 'error'
        });
      }
    } catch (error) {
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid radering',
        message: error.message,
        type: 'error'
      });
    } finally {
      setBulkActionLoading(false);
      await refreshAllTasks();
    }
  };

  const handleMigration = async () => {
    if (!window.confirm('⚠️ Vill du köra om AI-kategorisering på alla befintliga frågor med striktare svårighetsnivåer?\n\nDetta kommer att:\n- Uppdatera ageGroups för alla frågor\n- Använd striktare kriterier för barn/ungdom/vuxen\n- Köras som en bakgrundsuppgift\n\nFortse tt?')) {
      return;
    }

    setMigrationLoading(true);
    try {
      if (!currentUser) {
        throw new Error('Du måste vara inloggad för att köra migration');
      }

      // Hämta Firebase user för att få ID token
      const auth = getFirebaseAuth();
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        throw new Error('Kunde inte hitta Firebase-användare');
      }

      const idToken = await firebaseUser.getIdToken();
      const response = await fetch('https://europe-west1-geoquest2-7e45c.cloudfunctions.net/queueMigration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });
      const data = await response.json();

      if (response.ok) {
        setDialogConfig({
          isOpen: true,
          title: 'Migration startad',
          message: `AI-migration har köats som bakgrundsjobb. Du kan följa progress nedan.`,
          type: 'success'
        });
      } else {
        setDialogConfig({
          isOpen: true,
          title: 'Kunde inte starta migration',
          message: data.error || 'Okänt fel',
          type: 'error'
        });
      }
    } catch (error) {
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid migration',
        message: error.message,
        type: 'error'
      });
    } finally {
      setMigrationLoading(false);
      await refreshAllTasks();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-gray-100">
      <Header title="Bakgrundsjobb" />
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6 pt-24">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Totalt</div>
            <div className="mt-2 text-2xl font-semibold text-white">{stats.total}</div>
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Aktiva</div>
            <div className="mt-2 text-2xl font-semibold text-amber-300">{stats.active}</div>
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Klara 24h</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-300">{stats.last24hCompleted}</div>
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Misslyckade</div>
            <div className="mt-2 text-2xl font-semibold text-red-300">{stats.failed}</div>
          </div>
        </section>

        {/* Underhåll-sektion */}
        <section className="rounded-xl bg-slate-900 border border-slate-800 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Developer Tools</h3>
              <p className="text-sm text-slate-400 mt-1">
                Migrera frågor, städa gamla jobb eller konfigurera AI-providers
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => navigate('/superuser/ai-providers')}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                ⚙️ AI Providers
              </button>
              <button
                onClick={handleMigration}
                disabled={migrationLoading}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                {migrationLoading ? '🔄 Kör migration...' : '🔄 Migrera frågor'}
              </button>
              <button
                onClick={handleCleanup}
                disabled={cleanupLoading}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                {cleanupLoading ? '🧹 Städar...' : '🧹 Städa hängande'}
              </button>
              <button
                onClick={handleDeleteOldTasks}
                disabled={deleteLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                {deleteLoading ? '🗑️ Raderar...' : '🗑️ Radera gamla'}
              </button>
            </div>
          </div>
          {cleanupResult && (
            <div className={`mt-4 p-3 rounded-lg ${cleanupResult.success ? 'bg-green-500/10 border border-green-500/30 text-green-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
              {cleanupResult.message}
            </div>
          )}
          {deleteResult && (
            <div className={`mt-3 p-3 rounded-lg ${deleteResult.success ? 'bg-green-500/10 border border-green-500/30 text-green-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
              {deleteResult.message}
            </div>
          )}
        </section>

        <section className="rounded-xl bg-slate-900 border border-slate-800 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="bg-slate-950 border border-slate-700 px-3 py-1.5 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="all">Alla statusar</option>
                {Object.keys(STATUS_LABELS).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="bg-slate-950 border border-slate-700 px-3 py-1.5 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="all">Alla typer</option>
                <option value="generation">Generering</option>
                <option value="validation">Validering</option>
                <option value="batchvalidation">Batch-validering</option>
                <option value="migration">Migrering</option>
                <option value="regenerateemoji">Emoji-regenerering</option>
                <option value="batchregenerateemojis">Mass-regenerering Emojis</option>
              </select>
            </div>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Sök på jobbid, användare eller provider"
              className="w-full md:w-72 bg-slate-950 border border-slate-700 px-3 py-1.5 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Bulk Actions */}
          {selectedTasks.size > 0 && (
            <div className="mb-4 bg-slate-800 rounded-lg p-3 border border-cyan-500/30">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-white">
                  <span className="font-semibold">{selectedTasks.size}</span> jobb valda
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleBulkStop}
                    disabled={bulkActionLoading}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm rounded-md font-semibold transition-colors"
                  >
                    ⏸️ Stoppa valda
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkActionLoading}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm rounded-md font-semibold transition-colors"
                  >
                    🗑️ Radera valda
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 border-b border-slate-800 w-10">
                    <input
                      type="checkbox"
                      checked={filteredTasks.length > 0 && selectedTasks.size === filteredTasks.length}
                      onChange={handleToggleAll}
                      className="w-4 h-4 bg-slate-700 border-slate-600 rounded focus:ring-2 focus:ring-cyan-500"
                    />
                  </th>
                  <th className="px-4 py-2 border-b border-slate-800">Jobb</th>
                  <th className="px-4 py-2 border-b border-slate-800">Status</th>
                  <th className="px-4 py-2 border-b border-slate-800">Start</th>
                  <th className="px-4 py-2 border-b border-slate-800">Klart</th>
                  <th className="px-4 py-2 border-b border-slate-800">Tid</th>
                  <th className="px-4 py-2 border-b border-slate-800">Användare</th>
                  <th className="px-4 py-2 border-b border-slate-800">Detaljer</th>
                  <th className="px-4 py-2 border-b border-slate-800">Åtgärder</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      Inga jobb matchar dina filter just nu.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => {
                    const statusBadge = STATUS_BADGES[task.status] || STATUS_BADGES.pending;
                    const statusLabel = STATUS_LABELS[task.status] || task.status;
                    const payloadDetails = [];
                    if (task.payload?.category) payloadDetails.push(`Kategori: ${task.payload.category}`);
                    if (task.payload?.difficulty) payloadDetails.push(`Nivå: ${task.payload.difficulty}`);
                    if (task.payload?.amount) payloadDetails.push(`Antal: ${task.payload.amount}`);
                    if (task.result?.provider) payloadDetails.push(`Provider: ${task.result.provider}`);

                    // För batch-validering: visa resultat från result-objektet
                    if (task.taskType === 'batchvalidation' && task.result && task.status === 'completed') {
                      if (task.result.validated != null && task.result.failed != null) {
                        payloadDetails.push(`✓ ${task.result.validated} godkända`);
                        payloadDetails.push(`✗ ${task.result.failed} underkända`);
                      }
                    } else if (task.taskType === 'generation' && task.result && task.status === 'completed') {
                      // För generation: visa detaljerad information
                      if (task.result.details) {
                        if (task.result.details.imported != null) {
                          payloadDetails.push(`✓ ${task.result.details.imported} importerade`);
                        }
                        if (task.result.details.duplicatesBlocked > 0) {
                          payloadDetails.push(`⊘ ${task.result.details.duplicatesBlocked} dubletter blockerade`);
                        }
                        if (task.result.details.category) {
                          payloadDetails.push(`Kategori: ${task.result.details.category}`);
                        }
                        if (task.result.details.ageGroup) {
                          payloadDetails.push(`Åldersgrupp: ${task.result.details.ageGroup}`);
                        }
                      } else if (task.result.count != null) {
                        payloadDetails.push(`Resultat: ${task.result.count}`);
                      }
                    } else if (task.result?.count != null) {
                      // För andra tasks
                      payloadDetails.push(`Resultat: ${task.result.count}`);
                    }

                    if (task.error) payloadDetails.push(`Fel: ${task.error}`);

                    // Progress för batch-validering och generering
                    const hasProgress = task.progress && (task.progress.total > 0 || task.progress.phase);
                    const progressPercent = hasProgress && task.progress.total > 0
                      ? Math.round((task.progress.completed / task.progress.total) * 100)
                      : 0;

                    return (
                      <tr key={task.id} className="border-b border-slate-800/60">
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={selectedTasks.has(task.id)}
                            onChange={() => handleToggleTask(task.id)}
                            className="w-4 h-4 bg-slate-700 border-slate-600 rounded focus:ring-2 focus:ring-cyan-500"
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-2">
                            <div className="text-white font-semibold">
                              {task.taskType === 'generation' ? 'AI-generering' :
                               task.taskType === 'batchvalidation' ? 'AI-validering (batch)' :
                               task.taskType === 'validation' ? 'AI-validering' :
                               task.taskType === 'migration' ? 'AI-migrering' :
                               task.taskType === 'regenerateemoji' ? 'Emoji-regenerering' :
                               task.taskType === 'batchregenerateemojis' ? 'Mass-regenerering Emojis' : 'Bakgrundsjobb'}
                            </div>
                            {task.taskType === 'batchvalidation' && task.payload?.questions?.length && (
                              <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-200 rounded">
                                {task.payload.questions.length} frågor
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">{task.id.substring(0, 8)}...</div>

                          {/* Progress bar för batch-jobb */}
                          {hasProgress && task.status === 'processing' && (
                            <div className="mt-2 space-y-1">
                              {task.progress.total > 0 && (
                                <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                                  <div
                                    className="bg-cyan-500 h-full transition-all duration-300"
                                    style={{ width: `${progressPercent}%` }}
                                  />
                                </div>
                              )}
                              <div className="text-xs text-slate-400">
                                {task.progress.phase && <div className="font-semibold">{task.progress.phase}</div>}
                                {task.progress.total > 0 && (
                                  <div>
                                    {task.progress.completed} / {task.progress.total}
                                    {task.taskType === 'batchvalidation' && task.progress.validated > 0 &&
                                      ` (${task.progress.validated} godkända, ${task.progress.failed} underkända)`}
                                    {task.taskType === 'migration' && task.progress.details &&
                                      ` - ${task.progress.details}`}
                                  </div>
                                )}
                                {task.progress.details && <div className="text-slate-500">{task.progress.details}</div>}
                              </div>
                            </div>
                          )}

                          {/* Slutlig progress för klara jobb */}
                          {hasProgress && task.status === 'completed' && (
                            <div className="mt-1 text-xs text-slate-400">
                              {task.taskType === 'batchvalidation' && task.progress.validated != null &&
                                `${task.progress.validated} godkända, ${task.progress.failed} underkända`}
                              {task.taskType === 'generation' && task.progress.details &&
                                task.progress.details}
                              {task.taskType === 'migration' && task.progress.details &&
                                task.progress.details}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusBadge}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-300">
                          {formatDateTime(task.createdAt)}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-300">
                          {formatDateTime(task.finishedAt)}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-300">
                          {task.createdAt && task.finishedAt ? toDuration(task.createdAt, task.finishedAt) : '—'}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-300">
                          {task.userId || 'Okänd'}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-300 text-xs space-y-1">
                          {payloadDetails.length > 0 ? (
                            payloadDetails.map((line, index) => (
                              <div key={index}>{line}</div>
                            ))
                          ) : (
                            <span className="text-slate-500">Ingen metadata</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex gap-2">
                            {/* Stop knapp - visa bara för pågående jobb */}
                            {(task.status === 'processing' || task.status === 'queued' || task.status === 'pending') && (
                              <button
                                onClick={() => handleStopTask(task.id)}
                                className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded font-semibold transition-colors"
                                title="Stoppa jobb"
                              >
                                ⏸️
                              </button>
                            )}
                            {/* Delete knapp - visa alltid */}
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded font-semibold transition-colors"
                              title="Radera jobb"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

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

export default SuperUserTasksPage;