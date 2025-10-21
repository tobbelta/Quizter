/**
 * Resultatvy efter avslutad runda.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRun } from '../context/RunContext';
import { useAuth } from '../context/AuthContext';
import { questionService } from '../services/questionService';
import Header from '../components/layout/Header';
import PaymentModal from '../components/payment/PaymentModal';
import { analyticsService } from '../services/analyticsService';
import { describeParticipantStatus } from '../utils/participantStatus';

const RunResultsPage = () => {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { currentRun, participants, currentParticipant, loadRunById, refreshParticipants } = useRun();
  const { currentUser, isAuthenticated } = useAuth();
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [donationFeedback, setDonationFeedback] = useState('');
  const [selectedLanguage] = useState(() => {
    // Läs från localStorage eller använd svenska som default
    if (typeof window !== 'undefined') {
      return localStorage.getItem('quizter:language') || 'sv';
    }
    return 'sv';
  });

  useEffect(() => {
    if (!currentRun || currentRun.id !== runId) {
      loadRunById(runId).catch((error) => console.warn('Kunde inte ladda runda', error));
    }
  }, [currentRun, loadRunById, runId]);

  useEffect(() => {
    refreshParticipants().catch((error) => console.warn('Kunde inte uppdatera deltagare', error));
  }, [refreshParticipants]);

  const handleOpenDonation = () => {
    setDonationFeedback('');
    setShowDonationModal(true);
  };

  const handleDonationSuccess = (paymentResult) => {
    setShowDonationModal(false);
    setDonationFeedback('Tack för ditt stöd! Donationen registrerades.');

    if (paymentResult?.paymentIntentId && currentRun) {
      analyticsService.logDonation(2000, paymentResult.paymentIntentId, {
        runId: currentRun.id,
        context: 'results',
      });
    }
  };

  const handleDonationCancel = () => {
    setShowDonationModal(false);
  };

  /** Skapar topplistan baserat på poäng och sluttider. */
  const ranking = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.completedAt || '').localeCompare(b.completedAt || '');
    });
  }, [participants]);

  /** Skapar detaljerad lista med alla frågor och användarens svar */
  const detailedResults = useMemo(() => {
    if (!currentParticipant || !currentRun?.questionIds) return [];

    return currentRun.questionIds.map((questionId, index) => {
      let question = questionService.getByIdForLanguage(questionId, selectedLanguage);

      // Fallback-logik om frågan inte hittas för valt språk
      if (!question) {
        question = questionService.getByIdForLanguage(questionId, 'sv'); // Försök svenska
      }
      if (!question) {
        question = questionService.getById(questionId); // Försök utan språk
      }
      if (!question) {
        console.warn(`[RunResultsPage] Fråga med ID ${questionId} hittades inte`);
        // Skapa fallback-fråga så inget försvinner
        question = {
          id: questionId,
          text: `Fråga ${questionId} kunde inte laddas`,
          options: ['Kunde inte ladda alternativ'],
          correctOption: 0,
          explanation: 'Denna fråga kunde inte laddas från databasen.'
        };
      }

      const userAnswer = currentParticipant.answers?.find(a => a.questionId === questionId);
      const isCorrect = userAnswer?.correct || false;
      const userSelectedOption = userAnswer?.answerIndex;

      return {
        questionNumber: index + 1,
        question: question.text,
        options: question.options,
        correctOption: question.correctOption,
        userSelectedOption,
        isCorrect,
        explanation: question.explanation
      };
    }); // Ta bort .filter(Boolean) så alla frågor visas
  }, [currentParticipant, currentRun, selectedLanguage]);

  // Kontrollera om användaren är skapare av rundan
  const isCreator = currentRun && currentUser && (
    currentRun.createdBy === currentUser.id ||
    currentRun.createdByName === currentUser.name
  );

  if (!currentRun) {
    return (
      <div className="min-h-screen bg-slate-950">
        <Header title="Resultat" />
        <div className="mx-auto max-w-2xl px-4 pt-24 text-center">
          <p className="text-gray-300">Hämtar resultat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title={`Resultat - ${currentRun.name}`} />
      <div className="mx-auto max-w-4xl px-4 pt-24 pb-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <p className="text-gray-400">Status: {currentRun.status}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Detaljerade resultat knapp */}
            {currentParticipant && (
              <button
                type="button"
                onClick={() => setShowDetailedResults(!showDetailedResults)}
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:bg-slate-600"
              >
                {showDetailedResults ? 'Dölj' : 'Visa'} mina svar
              </button>
            )}
          </div>
        </div>

        {donationFeedback && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-900/30 px-4 py-3 text-emerald-100">
            {donationFeedback}
          </div>
        )}

      <section className="rounded border border-emerald-500/40 bg-emerald-900/20 p-6">
        <h2 className="text-xl font-semibold mb-3 text-emerald-200">Ledartavla</h2>
        <ol className="space-y-2">
          {ranking.length === 0 && <li className="text-gray-300">Inga svar registrerade ännu.</li>}
          {ranking.map((participant, index) => {
            const statusMeta = describeParticipantStatus(participant.status);
            return (
              <li key={participant.id} className="flex items-center justify-between rounded bg-emerald-900/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${statusMeta.dotClass}`} />
                  <span>#{index + 1} {participant.alias}{participant.isAnonymous ? ' (anonym)' : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{participant.score} poäng</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.pillClass}`}>
                    {statusMeta.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Detaljerade resultat för nuvarande användare */}
      {showDetailedResults && currentParticipant && detailedResults.length > 0 && (
        <section className="rounded border border-cyan-500/40 bg-cyan-900/10 p-6">
          <h2 className="text-xl font-semibold mb-3 text-cyan-200">
            Dina detaljerade resultat ({currentParticipant.score}/{detailedResults.length} rätt)
          </h2>
          <div className="space-y-4">
            {detailedResults.map((result) => (
              <div key={result.questionNumber} className={`rounded-lg border p-4 ${
                result.isCorrect
                  ? 'border-emerald-500/40 bg-emerald-900/20'
                  : 'border-red-500/40 bg-red-900/20'
              }`}>
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-white">
                    Fråga {result.questionNumber}: {result.question}
                  </h3>
                  <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                    result.isCorrect
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'bg-red-500/20 text-red-200'
                  }`}>
                    {result.isCorrect ? '✓ Rätt' : '✗ Fel'}
                  </span>
                </div>

                <div className="space-y-2 mb-3">
                  {result.options.map((option, index) => {
                    const isCorrect = index === result.correctOption;
                    const isUserSelected = index === result.userSelectedOption;

                    return (
                      <div key={index} className={`rounded px-3 py-2 text-sm ${
                        isCorrect && isUserSelected
                          ? 'bg-emerald-500/30 border border-emerald-500/50 text-emerald-100'
                          : isUserSelected && !isCorrect
                          ? 'bg-red-500/30 border border-red-500/50 text-red-100'
                          : isCorrect
                          ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-200'
                          : 'bg-slate-800/50 border border-slate-600 text-gray-300'
                      }`}>
                        {option}
                        {isUserSelected && <span className="ml-2 text-xs">← Ditt svar</span>}
                        {isCorrect && <span className="ml-2 text-xs">← Rätt svar</span>}
                      </div>
                    );
                  })}
                </div>

                {result.explanation && (
                  <div className="bg-slate-800/50 rounded-lg p-3 text-sm text-gray-300">
                    <span className="font-semibold text-cyan-200">Förklaring: </span>
                    {result.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded border border-slate-600 bg-slate-900/60 p-6">
        <h2 className="text-xl font-semibold mb-3">Detaljer</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-800/70">
              <tr>
                <th className="px-3 py-2 text-left">Deltagare</th>
                <th className="px-3 py-2 text-left">Rätt svar</th>
                <th className="px-3 py-2 text-left">Tidsstämpel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {ranking.map((participant) => (
                <tr key={participant.id}>
                  <td className="px-3 py-2">{participant.alias}</td>
                  <td className="px-3 py-2">{participant.score} / {currentRun.questionCount}</td>
                  <td className="px-3 py-2 text-gray-400">{participant.completedAt ? new Date(participant.completedAt).toLocaleString() : 'Pågående'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        {currentParticipant && (
          <button
            type="button"
            onClick={() => navigate(`/run/${currentRun.id}/play`)}
            className="rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400"
          >
            Tillbaka till rundan
          </button>
        )}
        {isCreator && (
          <button
            type="button"
            onClick={() => navigate(`/run/${currentRun.id}/admin`)}
            className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
          >
            Administrera
          </button>
        )}
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => navigate('/my-runs')}
            className="rounded bg-purple-600 px-4 py-2 font-semibold text-white hover:bg-purple-700"
          >
            Mina rundor
          </button>
        )}
        <button
          type="button"
          onClick={handleOpenDonation}
          disabled={showDonationModal}
          className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
        >
          Stöd Quizter (20 kr)
        </button>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600"
        >
          Startsidan
        </button>
      </div>

      <PaymentModal
        isOpen={showDonationModal}
        runName={currentRun?.name || ''}
        amount={2000}
        onSuccess={handleDonationSuccess}
        onCancel={handleDonationCancel}
        runId={currentRun?.id}
        participantId={currentParticipant?.id}
        allowSkip={false}
      />

      </div>
    </div>
  );
};

export default RunResultsPage;



