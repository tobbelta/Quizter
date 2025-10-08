import React, { useMemo, useState } from 'react';
import Header from '../components/layout/Header';
import { useBackgroundTasks } from '../context/BackgroundTaskContext';

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
  const { allTasks } = useBackgroundTasks();
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTasks = useMemo(() => {
    return allTasks.filter((task) => {
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
  }, [allTasks, statusFilter, typeFilter, searchTerm]);

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

        <section className="rounded-xl bg-slate-900 border border-slate-800 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 border-b border-slate-800">Jobb</th>
                  <th className="px-4 py-2 border-b border-slate-800">Status</th>
                  <th className="px-4 py-2 border-b border-slate-800">Start</th>
                  <th className="px-4 py-2 border-b border-slate-800">Klart</th>
                  <th className="px-4 py-2 border-b border-slate-800">Tid</th>
                  <th className="px-4 py-2 border-b border-slate-800">Användare</th>
                  <th className="px-4 py-2 border-b border-slate-800">Detaljer</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
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
                    if (task.result?.count != null) payloadDetails.push(`Resultat: ${task.result.count}`);
                    if (task.error) payloadDetails.push(`Fel: ${task.error}`);

                    return (
                      <tr key={task.id} className="border-b border-slate-800/60">
                        <td className="px-4 py-3 align-top">
                          <div className="text-white font-semibold">
                            {task.taskType === 'generation' ? 'AI-generering' : 'AI-validering'}
                          </div>
                          <div className="text-xs text-slate-500">{task.id}</div>
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
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default SuperUserTasksPage;
