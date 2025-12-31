/**
 * Resultatvy efter avslutad runda.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRun } from '../context/RunContext';
import { useAuth } from '../context/AuthContext';
import { questionService } from '../services/questionService';
import { runRepository } from '../repositories/runRepository';
import Header from '../components/layout/Header';
import PaymentModal from '../components/payment/PaymentModal';
import { paymentService } from '../services/paymentService';
import { analyticsService } from '../services/analyticsService';
import { describeParticipantStatus } from '../utils/participantStatus';

const RunResultsPage = () => {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { currentRun, participants, currentParticipant, loadRunById, refreshParticipants } = useRun();
  const { currentUser, isAuthenticated } = useAuth();
  const [anonymousAccessDenied, setAnonymousAccessDenied] = useState(false);
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [donationFeedback, setDonationFeedback] = useState('');
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [donationAmount, setDonationAmount] = useState(2000);
  const [answersOverride, setAnswersOverride] = useState(null);
  const [answersByParticipant, setAnswersByParticipant] = useState({});
  const [participantDetailsById, setParticipantDetailsById] = useState({});
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
    if (!runId) return;
    const isAnonymous = !currentUser || currentUser.isAnonymous;
    if (!isAnonymous) return;

    let allowed = false;
    try {
      const key = `quizter:resultsAccess:${runId}`;
      allowed = sessionStorage.getItem(key) === 'allowed';
      if (allowed) {
        sessionStorage.removeItem(key);
      }
    } catch (error) {
      allowed = false;
    }

    if (!allowed) {
      setAnonymousAccessDenied(true);
    }
  }, [currentUser, runId]);

  useEffect(() => {
    let isActive = true;
    paymentService.getPaymentConfig().then((config) => {
      if (!isActive) return;
      setPaymentConfig(config);
      const amounts = config?.donations?.amounts;
      if (Array.isArray(amounts) && amounts.length > 0) {
        setDonationAmount(amounts[0]);
      }
    });
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    refreshParticipants().catch((error) => console.warn('Kunde inte uppdatera deltagare', error));
  }, [refreshParticipants]);

  useEffect(() => {
    let isActive = true;

    const loadParticipantAnswers = async () => {
      if (!runId || participants.length === 0) {
        setAnswersByParticipant({});
        setParticipantDetailsById({});
        return;
      }

      const detailEntries = await Promise.all(participants.map(async (participant) => {
        try {
          const refreshed = await runRepository.getParticipant(runId, participant.id);
          return [
            participant.id,
            {
              participant: refreshed || null,
              answers: Array.isArray(refreshed?.answers) ? refreshed.answers : []
            }
          ];
        } catch (error) {
          console.warn('[RunResultsPage] Kunde inte hämta svar för deltagare:', participant.id, error);
          return [participant.id, { participant: null, answers: [] }];
        }
      }));

      if (!isActive) return;
      const nextDetails = Object.fromEntries(detailEntries);
      const nextAnswers = {};
      const nextParticipants = {};

      Object.entries(nextDetails).forEach(([participantId, entry]) => {
        nextAnswers[participantId] = entry.answers || [];
        if (entry.participant) {
          nextParticipants[participantId] = entry.participant;
        }
      });

      setAnswersByParticipant(nextAnswers);
      setParticipantDetailsById(nextParticipants);
    };

    loadParticipantAnswers();

    return () => {
      isActive = false;
    };
  }, [participants, runId]);

  useEffect(() => {
    let isActive = true;

    const hydrateAnswers = async () => {
      if (!currentParticipant?.id || !runId) return;
      const existingAnswers = Array.isArray(currentParticipant.answers)
        ? currentParticipant.answers
        : [];
      if (existingAnswers.length > 0) {
        setAnswersOverride(null);
        return;
      }

      try {
        const refreshed = await runRepository.getParticipant(runId, currentParticipant.id);
        if (!isActive) return;
        setAnswersOverride(Array.isArray(refreshed?.answers) ? refreshed.answers : []);
      } catch (error) {
        console.warn('[RunResultsPage] Kunde inte ladda svar:', error);
      }
    };

    hydrateAnswers();

    return () => {
      isActive = false;
    };
  }, [currentParticipant, runId]);

  const handleOpenDonation = () => {
    setDonationFeedback('');
    setShowDonationModal(true);
  };

  const handleDonationSuccess = (paymentResult) => {
    setShowDonationModal(false);
    setDonationFeedback('Tack för ditt stöd! Donationen registrerades.');

    if (paymentResult?.providerPaymentId && currentRun) {
      analyticsService.logDonation(donationAmount, paymentResult.providerPaymentId, {
        runId: currentRun.id,
        context: 'results',
      });
    }
  };

  const handleDonationCancel = () => {
    setShowDonationModal(false);
  };

  const normalizedAnswers = useMemo(() => {
    const participantAnswers = currentParticipant
      ? answersByParticipant[currentParticipant.id]
      : null;
    const sourceAnswers = answersOverride
      || participantAnswers
      || (Array.isArray(currentParticipant?.answers) ? currentParticipant.answers : []);
    if (!Array.isArray(sourceAnswers)) return [];
    return sourceAnswers.map((answer) => ({
      questionId: answer.questionId ?? answer.question_id,
      answerIndex: answer.answerIndex ?? answer.answer_index,
      correct: answer.correct ?? answer.is_correct ?? false
    }));
  }, [answersByParticipant, answersOverride, currentParticipant]);

  const scoredParticipants = useMemo(() => {
    const activeThresholdMs = 45000;
    const totalQuestions = currentRun?.questionCount || currentRun?.questionIds?.length || 0;

    return participants.map((participant) => {
      const isCurrent = participant.id === currentParticipant?.id;
      const storedAnswers = answersByParticipant[participant.id];
      const fallbackAnswers = isCurrent ? normalizedAnswers : [];
      const answers = Array.isArray(storedAnswers) && storedAnswers.length > 0
        ? storedAnswers
        : fallbackAnswers;
      const score = answers.filter((answer) => Boolean(answer?.correct ?? answer?.is_correct)).length;
      const details = participantDetailsById[participant.id] || {};
      let completedAt = details.completedAt ?? details.completed_at ?? participant.completedAt ?? participant.completed_at;
      const lastSeen = details.lastSeen ?? details.last_seen ?? participant.lastSeen ?? participant.last_seen;
      const hasCompleted = totalQuestions > 0 && answers.length >= totalQuestions;

      if (!completedAt && isCurrent && hasCompleted) {
        completedAt = Date.now();
      }

      let status = participant.status;
      if (!status) {
        if (completedAt || hasCompleted) {
          status = 'finished';
        } else if (isCurrent) {
          status = 'active';
        } else if (lastSeen && Date.now() - Number(lastSeen) <= activeThresholdMs) {
          status = 'active';
        } else {
          status = 'inactive';
        }
      }

      return {
        ...participant,
        score,
        completedAt,
        status
      };
    });
  }, [answersByParticipant, currentParticipant, currentRun, normalizedAnswers, participantDetailsById, participants]);

  const currentParticipantScore = useMemo(() => {
    return normalizedAnswers.filter((answer) => Boolean(answer?.correct)).length;
  }, [normalizedAnswers]);

  const normalizeCompletedAt = (value) => {
    if (!value) return Number.MAX_SAFE_INTEGER;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
  };

  /** Skapar topplistan baserat på poäng och sluttider. */
  const ranking = useMemo(() => {
    return [...scoredParticipants].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return normalizeCompletedAt(a.completedAt) - normalizeCompletedAt(b.completedAt);
    });
  }, [scoredParticipants]);

  const donationEnabled = Boolean(
    paymentConfig?.paymentsEnabled
    && paymentConfig?.donations?.enabled
    && paymentConfig?.donations?.placements?.afterRun
  );
  const donationCurrency = paymentConfig?.currency || 'sek';
  const donationAmounts = Array.isArray(paymentConfig?.donations?.amounts)
    ? paymentConfig.donations.amounts
    : [];
  const formatDonation = (value) => `${(Number(value || 0) / 100).toFixed(2)} ${donationCurrency.toUpperCase()}`;

  /** Skapar detaljerad lista med alla frågor och användarens svar */
  const detailedResults = useMemo(() => {
    const questionIds = Array.isArray(currentRun?.questionIds) ? currentRun.questionIds : [];
    if (!currentParticipant || questionIds.length === 0) return [];

    return questionIds.map((questionId, index) => {
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

      const userAnswer = normalizedAnswers.find(a => a.questionId === questionId);
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
  }, [currentParticipant, currentRun, normalizedAnswers, selectedLanguage]);

  // Kontrollera om användaren är skapare av rundan
  const isCreator = currentRun && currentUser && (
    currentRun.createdBy === currentUser.id ||
    currentRun.createdByName === currentUser.name
  );

  if (anonymousAccessDenied) {
    return (
      <div className="min-h-screen bg-slate-950">
        <Header title="Resultat" />
        <div className="mx-auto max-w-lg px-4 pt-24 text-center text-gray-200">
          <h1 className="text-2xl font-semibold mb-4">Resultat sparas på konton</h1>
          <p className="text-sm text-gray-300 mb-6">
            Som oregistrerad spelare kan du bara se resultat direkt efter rundan. Skapa ett konto för att spara historik.
          </p>
          <button
            onClick={() => navigate('/register')}
            className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-black"
          >
            Skapa konto
          </button>
        </div>
      </div>
    );
  }

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

        {donationEnabled && (
          <section className="rounded-2xl border border-emerald-500/30 bg-emerald-900/20 p-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-emerald-200">Stöd Quizter</h2>
              <p className="text-sm text-gray-300">
                Donera valfritt belopp för att stötta utvecklingen av Quizter.
              </p>
            </div>
            {donationAmounts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {donationAmounts.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDonationAmount(value)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                      donationAmount === value
                        ? 'bg-emerald-500 text-black'
                        : 'bg-slate-800 text-emerald-100 hover:bg-slate-700'
                    }`}
                  >
                    {formatDonation(value)}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Eget belopp</label>
                <input
                  type="number"
                  min="0"
                  value={Number.isFinite(Number(donationAmount)) ? donationAmount / 100 : 0}
                  onChange={(event) => {
                    const value = Math.max(0, Number(event.target.value) || 0);
                    setDonationAmount(Math.round(value * 100));
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-400 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleOpenDonation}
                disabled={showDonationModal}
                className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
              >
                Donera {formatDonation(donationAmount)}
              </button>
            </div>
          </section>
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
            Dina detaljerade resultat ({currentParticipantScore}/{detailedResults.length} rätt)
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
          onClick={() => navigate('/')}
          className="rounded bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600"
        >
          Startsidan
        </button>
      </div>

      <PaymentModal
        isOpen={showDonationModal}
        title="Stöd Quizter"
        description="Tack för att du hjälper oss utveckla Quizter vidare."
        purpose="donation"
        amount={donationAmount}
        currency={donationCurrency}
        onSuccess={handleDonationSuccess}
        onCancel={handleDonationCancel}
        context={{
          runId: currentRun?.id,
          participantId: currentParticipant?.id,
          userId: currentUser?.id,
          context: 'results'
        }}
        allowSkip={false}
      />

      </div>
    </div>
  );
};

export default RunResultsPage;
