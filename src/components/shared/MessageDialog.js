/**
 * MessageDialog - Enkel dialog för att visa meddelanden
 * Ersätter alert() med en snyggare dialog
 *
 * Props:
 * - isOpen: boolean - om dialogen ska visas
 * - onClose: function - callback när dialogen stängs
 * - title: string - dialogens titel
 * - message: string - meddelandets innehåll
 * - type: 'success' | 'error' | 'warning' | 'info' - typ av meddelande (default: 'info')
 */
import React from 'react';

const MessageDialog = ({
  isOpen,
  onClose,
  title = 'Meddelande',
  message,
  type = 'info'
}) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Färger och ikoner baserat på typ
  const typeConfig = {
    success: {
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/50',
      textColor: 'text-green-400',
      iconColor: 'text-green-400',
      icon: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    error: {
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/50',
      textColor: 'text-red-400',
      iconColor: 'text-red-400',
      icon: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    warning: {
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/50',
      textColor: 'text-yellow-400',
      iconColor: 'text-yellow-400',
      icon: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    },
    info: {
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/50',
      textColor: 'text-cyan-400',
      iconColor: 'text-cyan-400',
      icon: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
  };

  const config = typeConfig[type] || typeConfig.info;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[1200]"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-slate-900 rounded-xl shadow-2xl border border-slate-700 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Content */}
        <div className="p-6">
          {/* Icon */}
          <div className={`flex justify-center mb-4 ${config.iconColor}`}>
            {config.icon}
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-white mb-3 text-center">
            {title}
          </h2>

          {/* Message */}
          <div className={`${config.bgColor} ${config.borderColor} border rounded-lg p-4 mb-6`}>
            <p className={`${config.textColor} text-center whitespace-pre-line`}>
              {message}
            </p>
          </div>

          {/* OK Button */}
          <button
            onClick={onClose}
            className="w-full bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-700 hover:to-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition-all shadow-lg"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageDialog;
