/**
 * Dialog för att rapportera en fråga
 */
import React, { useState } from 'react';
import { questionService } from '../../services/questionService';
import MessageDialog from './MessageDialog';

const ReportQuestionDialog = ({ questionId, questionText, onClose, onReported }) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!reason.trim()) {
      setDialogConfig({
        isOpen: true,
        title: 'Anledning saknas',
        message: 'Ange en anledning till rapporten',
        type: 'warning'
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Använd användarens alias om tillgängligt, annars 'anonymous'
      const reportedBy = localStorage.getItem('quizter:user:alias') || 'anonymous';

      await questionService.reportQuestion(questionId, reason.trim(), reportedBy);

      if (onReported) {
        onReported();
      }

      setDialogConfig({
        isOpen: true,
        title: 'Rapport skickad',
        message: 'Tack för din rapport! Frågan har skickats till granskning.',
        type: 'success'
      });
      setTimeout(() => onClose(), 2000);
    } catch (error) {
      console.error('Kunde inte rapportera fråga:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Kunde inte skicka rapport',
        message: error.message,
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-slate-700">
        <h2 className="text-xl font-bold text-white mb-4">Rapportera fråga</h2>

        {questionText && (
          <div className="mb-4 p-3 bg-slate-900 rounded border border-slate-700">
            <p className="text-sm text-gray-300">{questionText}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-semibold text-cyan-200 mb-2">
              Varför rapporterar du denna fråga?
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded bg-slate-900 border border-slate-600 px-3 py-2 text-white min-h-[100px]"
              placeholder="T.ex. 'Felaktigt svar', 'Tvetydiga alternativ', 'Olämpligt innehåll'..."
              required
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-400 mt-1">
              Din rapport hjälper oss att förbättra frågebanken. Frågan kommer att granskas av administratörer.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded bg-slate-700 px-4 py-2 font-semibold text-white hover:bg-slate-600"
              disabled={isSubmitting}
            >
              Avbryt
            </button>
            <button
              type="submit"
              className="flex-1 rounded bg-yellow-600 px-4 py-2 font-semibold text-white hover:bg-yellow-500 disabled:bg-slate-600 disabled:text-gray-400"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Skickar...' : '⚠️ Rapportera'}
            </button>
          </div>
        </form>

        <MessageDialog
          isOpen={dialogConfig.isOpen}
          onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
          title={dialogConfig.title}
          message={dialogConfig.message}
          type={dialogConfig.type}
        />
      </div>
    </div>
  );
};

export default ReportQuestionDialog;
