import React from 'react';
import { useNavigate } from 'react-router-dom';

const STATUS_STYLES = {
  queued: {
    label: 'Köad',
    badge: 'bg-slate-600 text-white',
  },
  pending: {
    label: 'Förbereds',
    badge: 'bg-slate-600 text-white',
  },
  processing: {
    label: 'Pågår',
    badge: 'bg-amber-500 text-black animate-pulse',
  },
  completed: {
    label: 'Klar',
    badge: 'bg-emerald-500 text-black',
  },
  failed: {
    label: 'Misslyckades',
    badge: 'bg-red-500 text-white',
  },
  cancelled: {
    label: 'Avbruten',
    badge: 'bg-gray-500 text-white',
  },
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
    });
  } catch (error) {
    return date.toString();
  }
};

const formatTaskLabel = (task) => {
  if (task.label) return task.label;
  if (task.taskType === 'generation') return 'AI-generering';
  if (task.taskType === 'validation') return 'AI-validering';
  if (task.taskType === 'regenerateemoji') return 'Emoji-regenerering';
  if (task.taskType === 'batchregenerateemojis') return 'Mass-regenerering Emojis';
  return 'Bakgrundsjobb';
};

const BackgroundTasksDropdown = ({
  isOpen,
  tasks,
  unreadTaskIds,
  onMarkTaskSeen,
  onMarkAllSeen,
  onClose,
  isSuperUser,
}) => {
  const navigate = useNavigate();

  if (!isOpen) {
    return null;
  }

  const hasTasks = tasks && tasks.length > 0;

  return (
    <div className="fixed top-16 right-4 z-[70] w-80 max-w-full">
      <div className="rounded-xl bg-slate-900/95 border border-slate-700 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-white">Bakgrundsjobb</h3>
            <p className="text-xs text-slate-400">
              Utsprungna i den här enheten
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Stäng"
          >
            ✕
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {!hasTasks ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              Inga aktiva jobb just nu. Starta en AI-generering eller validering för att se status här.
            </div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {tasks.map((task) => {
                const statusConfig = STATUS_STYLES[task.status] || STATUS_STYLES.pending;
                const isUnread = unreadTaskIds.has(task.id);
                const isFinished = ['completed', 'failed', 'cancelled'].includes(task.status);

                return (
                  <li key={task.id} className="px-4 py-3 bg-slate-900 text-sm text-slate-200">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">
                            {formatTaskLabel(task)}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusConfig.badge}`}>
                            {statusConfig.label}
                          </span>
                        </div>
                        {task.description && (
                          <p className="text-xs text-slate-400 mt-1">
                            {task.description}
                          </p>
                        )}
                        <div className="flex flex-col mt-2 text-[11px] text-slate-500 gap-0.5">
                          <span className="break-all">ID: {task.id}</span>
                          <span>Start: {formatDateTime(task.createdAt)}</span>
                          {task.finishedAt && (
                            <span>Klart: {formatDateTime(task.finishedAt)}</span>
                          )}
                          {task.result?.count != null && (
                            <span>Resultat: {task.result.count} objekt</span>
                          )}
                          {task.error && (
                            <span className="text-red-400">Fel: {task.error}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isFinished && (
                      <div className="flex items-center justify-between mt-3">
                        {isUnread ? (
                          <span className="text-xs font-semibold text-amber-400">
                            Nytt resultat
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">
                            Markerad som läst
                          </span>
                        )}
                        {isUnread && (
                          <button
                            type="button"
                            onClick={() => onMarkTaskSeen(task.id)}
                            className="text-xs text-cyan-300 hover:text-cyan-200 font-semibold"
                          >
                            Markera som läst
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {hasTasks && (
          <div className="border-t border-slate-800 px-4 py-3 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={onMarkAllSeen}
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              Markera allt som läst
            </button>

            {isSuperUser && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/admin/tasks');
                }}
                className="text-cyan-300 hover:text-cyan-200 font-semibold"
              >
                Öppna kööversikt
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BackgroundTasksDropdown;
