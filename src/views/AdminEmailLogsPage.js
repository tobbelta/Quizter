/**
 * Admin: E-postloggar
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';
import { emailLogService } from '../services/emailLogService';

const statusOptions = [
  { value: 'all', label: 'Alla' },
  { value: 'sent', label: 'Skickade' },
  { value: 'failed', label: 'Misslyckade' }
];

const AdminEmailLogsPage = () => {
  const navigate = useNavigate();
  const { isSuperUser, currentUser } = useAuth();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('');
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendStatus, setResendStatus] = useState('');

  const loadLogs = useCallback(async () => {
    if (!isSuperUser) return;
    setLoading(true);
    setError('');
    try {
      const data = await emailLogService.getEmailLogs({
        userEmail: currentUser?.email || '',
        status: statusFilter,
        limit,
        offset,
        providerId: providerFilter
      });
      setLogs(data.logs || []);
      setTotal(Number(data.total || 0));
    } catch (fetchError) {
      setError(fetchError.message || 'Kunde inte hämta loggar.');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.email, isSuperUser, limit, offset, providerFilter, statusFilter]);

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }
    loadLogs();
  }, [isSuperUser, loadLogs, navigate]);

  const providerOptions = useMemo(() => {
    const ids = new Set(logs.map((log) => log.provider_id).filter(Boolean));
    return Array.from(ids).sort();
  }, [logs]);

  const handleResend = async (logId) => {
    setResendStatus('');
    setError('');
    try {
      await emailLogService.resendEmail({ id: logId, userEmail: currentUser?.email || '' });
      setResendStatus('Mailet skickades igen.');
      loadLogs();
    } catch (resendError) {
      setError(resendError.message || 'Kunde inte skicka om mailet.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="E-postloggar" />
      <div className="max-w-6xl mx-auto px-4 pt-24 pb-10 space-y-6">
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-300">Status</label>
            <select
              className="mt-1 rounded bg-slate-800 border border-slate-700 px-3 py-2"
              value={statusFilter}
              onChange={(event) => { setStatusFilter(event.target.value); setOffset(0); }}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300">Provider</label>
            <select
              className="mt-1 rounded bg-slate-800 border border-slate-700 px-3 py-2"
              value={providerFilter}
              onChange={(event) => { setProviderFilter(event.target.value); setOffset(0); }}
            >
              <option value="">Alla</option>
              {providerOptions.map((providerId) => (
                <option key={providerId} value={providerId}>{providerId}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300">Per sida</label>
            <select
              className="mt-1 rounded bg-slate-800 border border-slate-700 px-3 py-2"
              value={limit}
              onChange={(event) => { setLimit(Number(event.target.value)); setOffset(0); }}
            >
              {[25, 50, 100].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
          <button
            className="rounded bg-slate-700 px-4 py-2 text-sm font-semibold"
            onClick={loadLogs}
            disabled={loading}
          >
            Uppdatera
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/60 bg-red-900/40 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}
        {resendStatus && (
          <div className="rounded-lg border border-emerald-500/60 bg-emerald-900/40 px-4 py-3 text-sm text-emerald-100">
            {resendStatus}
          </div>
        )}

        <div className="rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
          <div className="grid grid-cols-12 gap-3 px-4 py-3 text-xs font-semibold text-slate-400 border-b border-slate-800">
            <div className="col-span-2">Tid</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-3">Mottagare</div>
            <div className="col-span-3">Ämne</div>
            <div className="col-span-2">Åtgärd</div>
          </div>
          {loading ? (
            <div className="px-4 py-6 text-sm text-gray-300">Laddar loggar...</div>
          ) : logs.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-300">Inga loggar hittades.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="border-b border-slate-800 px-4 py-3 text-sm text-gray-200">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-2 text-xs text-gray-400">
                    {new Date(log.created_at).toLocaleString('sv-SE')}
                  </div>
                  <div className="col-span-2">
                    <span className={log.status === 'sent' ? 'text-emerald-300' : 'text-amber-300'}>
                      {log.status === 'sent' ? 'Skickad' : 'Misslyckad'}
                    </span>
                    {log.provider_id && (
                      <div className="text-xs text-gray-500">{log.provider_id}</div>
                    )}
                  </div>
                  <div className="col-span-3 break-all">
                    {log.to_email || '—'}
                  </div>
                  <div className="col-span-3">
                    {log.subject || '—'}
                  </div>
                  <div className="col-span-2 flex flex-col items-start gap-1">
                    <button
                      className="rounded bg-cyan-500 px-3 py-1 text-xs font-semibold text-black"
                      onClick={() => handleResend(log.id)}
                    >
                      Resend
                    </button>
                  </div>
                </div>
                {(log.response || log.error) && (
                  <div className="mt-2 text-xs text-gray-400">
                    {log.error ? `Fel: ${log.error}` : `Svar: ${log.response}`}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between text-sm text-gray-300">
          <div>Visar {Math.min(total, offset + limit)} av {total}</div>
          <div className="flex gap-2">
            <button
              className="rounded border border-slate-600 px-3 py-1"
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
            >
              Föregående
            </button>
            <button
              className="rounded border border-slate-600 px-3 py-1"
              onClick={() => setOffset(offset + limit)}
              disabled={offset + limit >= total}
            >
              Nästa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminEmailLogsPage;
