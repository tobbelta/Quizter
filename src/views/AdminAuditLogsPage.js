import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import MessageDialog from '../components/shared/MessageDialog';
import { useAuth } from '../context/AuthContext';
import { auditLogService } from '../services/auditLogService';

const TARGET_OPTIONS = [
  { value: '', label: 'Alla' },
  { value: 'ai-providers', label: 'AI-providerinställningar' },
  { value: 'ai-rules', label: 'AI-regler' },
  { value: 'categories', label: 'Kategorier' },
  { value: 'audiences', label: 'Ålders-/målgrupper' },
  { value: 'payments', label: 'Betalningar' },
  { value: 'email-settings', label: 'E-post' }
];

const AdminAuditLogsPage = () => {
  const navigate = useNavigate();
  const { isSuperUser, currentUser } = useAuth();
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [targetType, setTargetType] = useState('');
  const [actorEmail, setActorEmail] = useState('');
  const [action, setAction] = useState('');
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  const hasMore = logs.length >= limit;

  const loadLogs = async (reset = false) => {
    if (!currentUser?.email) return;
    setIsLoading(true);
    try {
      const nextOffset = reset ? 0 : offset;
      const nextLogs = await auditLogService.getAuditLogs({
        limit,
        offset: nextOffset,
        targetType,
        actorEmail,
        action,
        userEmail: currentUser.email
      });
      setLogs(reset ? nextLogs : [...logs, ...nextLogs]);
      setOffset(nextOffset + nextLogs.length);
      setError('');
    } catch (err) {
      setError(err.message || 'Kunde inte hämta loggar.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }
    loadLogs(true);
  }, [isSuperUser, navigate]);

  useEffect(() => {
    if (!isSuperUser) return;
    const timeout = setTimeout(() => {
      loadLogs(true);
    }, 300);
    return () => clearTimeout(timeout);
  }, [targetType, actorEmail, action, limit]);

  const formattedLogs = useMemo(() => {
    return logs.map((entry) => {
      const date = entry.createdAt ? new Date(entry.createdAt).toLocaleString('sv-SE') : 'Okänd tid';
      const detailsText = entry.details ? JSON.stringify(entry.details, null, 2) : '';
      return {
        ...entry,
        date,
        detailsText
      };
    });
  }, [logs]);

  const handleCopyDetails = (details) => {
    if (!details) return;
    if (!navigator?.clipboard) {
      setDialogConfig({
        isOpen: true,
        title: 'Kunde inte kopiera',
        message: 'Din webbläsare stöder inte clipboard API.',
        type: 'warning'
      });
      return;
    }
    navigator.clipboard.writeText(details).then(() => {
      setDialogConfig({
        isOpen: true,
        title: 'Kopierat',
        message: 'Detaljerna är kopierade.',
        type: 'success'
      });
    }).catch(() => {
      setDialogConfig({
        isOpen: true,
        title: 'Kunde inte kopiera',
        message: 'Misslyckades att kopiera detaljerna.',
        type: 'error'
      });
    });
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="Ändringslogg" />
      <div className="mx-auto max-w-6xl px-4 pt-24 pb-8 space-y-6">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
          <h1 className="text-2xl font-semibold text-slate-100">Admin audit-logg</h1>
          <p className="mt-2 text-sm text-slate-400">
            Spårar ändringar i inställningar så att du kan se vem som gjorde vad.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Område</label>
              <select
                value={targetType}
                onChange={(event) => setTargetType(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              >
                {TARGET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Admin</label>
              <input
                value={actorEmail}
                onChange={(event) => setActorEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                placeholder="email@..."
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Action</label>
              <input
                value={action}
                onChange={(event) => setAction(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                placeholder="update"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Antal</label>
              <select
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              >
                {[25, 50, 100, 150].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {formattedLogs.length === 0 && !isLoading && (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-6 text-sm text-slate-400">
              Inga loggar hittades.
            </div>
          )}

          {formattedLogs.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    {entry.action} · {entry.targetType}
                  </div>
                  <div className="text-xs text-slate-400">{entry.date}</div>
                </div>
                <div className="text-xs text-slate-400">
                  {entry.actorEmail || 'Okänd admin'}
                </div>
              </div>
              {entry.detailsText && (
                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-300">
                  <pre className="whitespace-pre-wrap">{entry.detailsText}</pre>
                  <button
                    type="button"
                    onClick={() => handleCopyDetails(entry.detailsText)}
                    className="mt-2 text-xs text-cyan-300 hover:text-cyan-200"
                  >
                    Kopiera detaljer
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => loadLogs(false)}
            disabled={isLoading || !hasMore}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-40"
          >
            {isLoading ? 'Laddar...' : hasMore ? 'Visa fler' : 'Ingen mer data'}
          </button>
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

export default AdminAuditLogsPage;
