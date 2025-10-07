import React from 'react';
import { useToast } from '../../context/ToastContext';

const VARIANT_STYLES = {
  info: {
    container: 'border-cyan-500/60 bg-slate-900/95',
    accent: 'bg-cyan-500',
    icon: 'ℹ️',
  },
  success: {
    container: 'border-emerald-500/60 bg-slate-900/95',
    accent: 'bg-emerald-500',
    icon: '✅',
  },
  warning: {
    container: 'border-amber-500/60 bg-slate-900/95',
    accent: 'bg-amber-500',
    icon: '⚠️',
  },
  error: {
    container: 'border-red-500/60 bg-slate-900/95',
    accent: 'bg-red-500',
    icon: '❌',
  },
};

const ToastViewport = () => {
  const { toasts, dismissToast } = useToast();

  if (!toasts.length) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-[80] flex flex-col gap-3 max-w-sm w-full">
      {toasts.map((toast) => {
        const styles = VARIANT_STYLES[toast.variant] || VARIANT_STYLES.info;
        return (
          <div
            key={toast.id}
            className={`relative overflow-hidden rounded-xl border shadow-lg shadow-slate-900/40 backdrop-blur ${styles.container}`}
          >
            <div className={`absolute inset-y-0 left-0 w-1 ${styles.accent}`} />
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="text-xl leading-none">{styles.icon}</div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">{toast.title}</div>
                {toast.message && (
                  <div className="mt-1 text-xs text-slate-300 whitespace-pre-line">
                    {toast.message}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white transition-colors"
                aria-label="Stäng"
                onClick={() => dismissToast(toast.id)}
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ToastViewport;

