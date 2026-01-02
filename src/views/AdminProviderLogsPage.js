import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import MessageDialog from '../components/shared/MessageDialog';
import { useAuth } from '../context/AuthContext';

const formatLogTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const renderPayload = (payload) => {
  if (!payload) return '—';
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return String(payload);
  }
};

const AdminProviderLogsPage = () => {
  const navigate = useNavigate();
  const { isSuperUser, currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [taskId, setTaskId] = useState(searchParams.get('taskId') || '');
  const [providerFilter, setProviderFilter] = useState(searchParams.get('provider') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedEntries, setExpandedEntries] = useState(new Set());
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const limit = 200;

  const toggleEntry = (logId) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  const loadLogs = useCallback(async (selectedTaskId) => {
    if (!selectedTaskId || !currentUser?.email) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/getProviderLogs?taskId=${encodeURIComponent(selectedTaskId)}&limit=${limit}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': currentUser.email
          }
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Kunde inte hämta loggar.');
      }
      setLogs(data.logs || []);
    } catch (err) {
      setError(err.message || 'Kunde inte hämta loggar.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.email, limit]);

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }
    const initialTaskId = searchParams.get('taskId') || '';
    const initialProvider = searchParams.get('provider') || '';
    const initialStatus = searchParams.get('status') || '';
    setTaskId(initialTaskId);
    setProviderFilter(initialProvider);
    setStatusFilter(initialStatus);
    if (initialTaskId) {
      loadLogs(initialTaskId);
    }
  }, [isSuperUser, navigate, searchParams, loadLogs]);

  const handleSearch = () => {
    if (!taskId.trim()) {
      setDialogConfig({
        isOpen: true,
        title: 'Task-ID saknas',
        message: 'Ange ett task-id för att visa loggar.',
        type: 'warning'
      });
      return;
    }
    const params = new URLSearchParams();
    params.set('taskId', taskId.trim());
    if (providerFilter) params.set('provider', providerFilter);
    if (statusFilter) params.set('status', statusFilter);
    setSearchParams(params);
    loadLogs(taskId.trim());
  };

  const providerOptions = useMemo(() => {
    const options = new Set();
    logs.forEach((log) => {
      if (log.provider) {
        options.add(log.provider);
      }
    });
    return Array.from(options).sort((a, b) => a.localeCompare(b, 'sv'));
  }, [logs]);

  const groupedLogs = useMemo(() => {
    return logs
      .filter((log) => {
        if (providerFilter && log.provider !== providerFilter) return false;
        if (statusFilter && log.status !== statusFilter) return false;
        return true;
      })
      .map((log) => ({
        ...log,
        createdLabel: formatLogTime(log.createdAt)
      }));
  }, [logs, providerFilter, statusFilter]);

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="Provider-loggar" />
      <div className="mx-auto max-w-6xl px-4 pt-24 pb-8 space-y-6">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
          <h1 className="text-2xl font-semibold text-slate-100">AI provider‑loggar</h1>
          <p className="mt-2 text-sm text-slate-400">
            Här kan du se råa request/response‑payloads per provider‑anrop.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <input
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              className="flex-1 min-w-[260px] rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              placeholder="Task-ID"
            />
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">Alla providers</option>
              {providerOptions.map((provider) => (
                <option key={provider} value={provider}>{provider}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">Alla status</option>
              <option value="success">OK</option>
              <option value="error">Fel</option>
            </select>
            <button
              onClick={handleSearch}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-400"
            >
              Visa loggar
            </button>
            <button
              onClick={() => navigate('/admin/tasks')}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
            >
              Tillbaka till jobb
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">
              Loggar ({groupedLogs.length})
            </h2>
            <button
              onClick={() => loadLogs(taskId.trim())}
              disabled={isLoading || !taskId.trim()}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600 disabled:opacity-60"
            >
              {isLoading ? 'Laddar...' : 'Uppdatera'}
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {groupedLogs.length === 0 && !isLoading ? (
            <div className="mt-4 text-sm text-slate-500">
              Inga loggar att visa ännu.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {groupedLogs.map((log) => {
                const isExpanded = expandedEntries.has(log.id);
                return (
                  <div key={log.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-white">
                        {log.provider} · {log.phase}
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                        log.status === 'success'
                          ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
                          : 'bg-red-500/20 text-red-200 border border-red-500/30'
                      }`}>
                        {log.status === 'success' ? 'OK' : 'Fel'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {log.createdLabel}
                      {log.durationMs != null ? ` · ${Math.round(log.durationMs)} ms` : ''}
                      {log.model ? ` · ${log.model}` : ''}
                    </div>
                    {log.error && (
                      <div className="mt-2 text-xs text-red-300 break-words">{log.error}</div>
                    )}
                    {log.metadata && (
                      <div className="mt-2 text-[11px] text-slate-500">
                        Metadata: {renderPayload(log.metadata)}
                      </div>
                    )}
                    <button
                      onClick={() => toggleEntry(log.id)}
                      className="mt-2 text-xs text-cyan-300 hover:text-cyan-200"
                    >
                      {isExpanded ? 'Dölj payload' : 'Visa payload'}
                    </button>
                    {isExpanded && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <div className="text-slate-400 text-xs">Request</div>
                          <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-950/60 p-2 text-[11px] text-slate-200">
                            {renderPayload(log.requestPayload)}
                          </pre>
                        </div>
                        <div>
                          <div className="text-slate-400 text-xs">Response</div>
                          <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-950/60 p-2 text-[11px] text-slate-200">
                            {renderPayload(log.responsePayload)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
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

export default AdminProviderLogsPage;
