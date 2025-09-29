/**
 * Spelvy där deltagaren ser karta, frågor och status.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRun } from '../context/RunContext';
import { useAuth } from '../context/AuthContext';
import { questionService } from '../services/questionService';
import { describeParticipantStatus } from '../utils/participantStatus';
import RunMap from '../components/run/RunMap';
import useRunLocation from '../hooks/useRunLocation';
import { calculateDistanceMeters, formatDistance } from '../utils/geo';

/**
 * Karttext för att visa status kring GPS och manuellt läge.
 */
const locationStatusLabels = {
  idle: 'GPS är avstängd.',
  pending: 'Försöker hämta din position…',
  active: 'GPS-spårning är aktiv.',
  denied: 'Åtkomst till GPS nekades – du kan starta frågorna manuellt.',
  unsupported: 'Din enhet eller webbläsare stöder inte geolokalisering.',
  unavailable: 'Positionen är tillfälligt otillgänglig.',
  timeout: 'Positionen kunde inte hämtas i tid.',
  error: 'Ett okänt fel uppstod i geolokaliseringen.'
};

const PROXIMITY_THRESHOLD_METERS = 25;

const PlayRunPage = () => {
  const { runId } = useParams();
  const navigate = useNavigate();
  const {
    currentRun,
    currentParticipant,
    loadRunById,
    submitAnswer,
    completeRunForParticipant,
    refreshParticipants,
    participants
  } = useRun();
  const { currentUser } = useAuth();
  const {
    trackingEnabled,
    status: locationStatus,
    coords,
    enableTracking,
    disableTracking,
    error: locationError,
    lastUpdated
  } = useRunLocation();

  const [selectedOption, setSelectedOption] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');
  const [questionVisible, setQuestionVisible] = useState(true);
  const [distanceToCheckpoint, setDistanceToCheckpoint] = useState(null);

  useEffect(() => {
    try {
      if (!currentRun || currentRun.id !== runId) {
        loadRunById(runId);
      }
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [currentRun, loadRunById, runId]);

  useEffect(() => {
    refreshParticipants().catch((err) => console.warn('Kunde inte uppdatera deltagare', err));
  }, [refreshParticipants]);

  const manualMode = !trackingEnabled || locationStatus === 'denied' || locationStatus === 'unsupported';

  useEffect(() => {
    setSelectedOption(null);
    setFeedback(null);
    setQuestionVisible(!manualMode);
  }, [currentParticipant?.currentOrder, manualMode]);

  const participantsSnapshot = useMemo(() => {
    if (!participants || participants.length === 0) return [];
    return [...participants].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.completedAt || '').localeCompare(b.completedAt || '');
    });
  }, [participants]);

  const orderedQuestions = useMemo(() => {
    if (!currentRun) return [];
    return currentRun.questionIds.map((id) => questionService.getById(id)).filter(Boolean);
  }, [currentRun]);

  const currentOrderIndex = useMemo(() => {
    if (!currentParticipant) return 0;
    return Math.max(0, currentParticipant.currentOrder - 1);
  }, [currentParticipant]);

  const nextCheckpoint = currentRun?.checkpoints?.[currentOrderIndex] || null;

  useEffect(() => {
    if (!coords || !nextCheckpoint) {
      setDistanceToCheckpoint(null);
      return;
    }
    const distance = calculateDistanceMeters(coords, nextCheckpoint.location);
    setDistanceToCheckpoint(distance);
  }, [coords, nextCheckpoint]);

  const nearCheckpoint = trackingEnabled && distanceToCheckpoint != null && distanceToCheckpoint <= PROXIMITY_THRESHOLD_METERS;

  const effectiveQuestionIndex = manualMode ? (questionVisible ? currentOrderIndex : null) : currentOrderIndex;
  const currentQuestion = typeof effectiveQuestionIndex === 'number' && effectiveQuestionIndex >= 0
    ? orderedQuestions[effectiveQuestionIndex] || null
    : null;

  const hasCompleted = Boolean(currentParticipant?.answers?.length >= orderedQuestions.length);
  const answeredCount = currentParticipant?.answers?.length || 0;

  /** Skickar in valt svar och visar feedback. */
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (selectedOption === null || !currentQuestion) {
      return;
    }
    const { correct } = await submitAnswer({
      questionId: currentQuestion.id,
      answerIndex: selectedOption
    });
    setFeedback(correct ? 'Rätt svar!' : 'Tyvärr fel svar.');
    setSelectedOption(null);
    if (manualMode) {
      setQuestionVisible(false);
    }
  };

  /** Markerar rundan som avslutad för nuvarande deltagare. */
  const handleFinish = async () => {
    await completeRunForParticipant();
    navigate(`/run/${currentRun.id}/results`);
  };

  /** Startar nästa fråga manuellt när GPS är avstängd. */
  const handleStartManualQuestion = () => {
    setQuestionVisible(true);
  };

  /** Växlar mellan GPS-läge och manuellt läge. */
  const handleToggleTracking = () => {
    if (trackingEnabled) {
      disableTracking();
    } else {
      enableTracking();
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">Något gick fel</h1>
        <p className="text-red-300">{error}</p>
      </div>
    );
  }

  if (!currentRun || !currentParticipant) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-center">
        <p className="text-gray-300">Hämtar rundainformation…</p>
      </div>
    );
  }

  const statusMessage = locationStatusLabels[locationStatus] || locationStatusLabels.idle;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <header className="border-b border-slate-700 pb-4">
        <h1 className="text-3xl font-bold mb-2">{currentRun.name}</h1>
        <p className="text-gray-300">Deltagare: {currentParticipant.alias || currentUser?.name}</p>
        <p className="text-sm text-gray-400">Fråga {Math.min(currentParticipant.currentOrder, orderedQuestions.length)} av {orderedQuestions.length}</p>
      </header>

      <section className="space-y-4 rounded border border-slate-700 bg-slate-900/60 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-cyan-200">GPS och karta</h2>
            <p className="text-sm text-gray-300">Slå på GPS för att se din position och låta appen följa dig automatiskt. Du kan alltid växla av och svara manuellt.</p>
            <p className="text-sm text-gray-400 mt-1">{statusMessage}</p>
            {nextCheckpoint && (
              <p className="text-sm text-gray-300 mt-1">
                Avstånd till nästa checkpoint: <span className="font-semibold">{formatDistance(distanceToCheckpoint)}</span>
              </p>
            )}
            {trackingEnabled && nearCheckpoint && (
              <p className="text-sm text-emerald-300 mt-1">Du är nästan framme vid nästa checkpoint – frågan är redo!</p>
            )}
            {locationError && locationStatus !== 'denied' && (
              <p className="text-sm text-amber-300 mt-1">{locationError.message}</p>
            )}
            {lastUpdated && (
              <p className="text-xs text-gray-500 mt-1">Senast uppdaterad: {lastUpdated.toLocaleTimeString()}</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleToggleTracking}
              className={trackingEnabled
                ? 'rounded bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600'
                : 'rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400'}
              disabled={locationStatus === 'unsupported'}
            >
              {trackingEnabled ? 'Stäng av GPS' : 'Slå på GPS'}
            </button>
          </div>
        </div>
        <RunMap
          checkpoints={currentRun.checkpoints || []}
          userPosition={coords}
          activeOrder={currentOrderIndex}
          answeredCount={answeredCount}
          route={currentRun.route}
        />
      </section>

      {hasCompleted ? (
        <section className="rounded-lg border border-emerald-500/40 bg-emerald-900/20 p-6 text-center space-y-4">
          <h2 className="text-2xl font-semibold text-emerald-200">Bra jobbat!</h2>
          <p className="text-gray-200">Du har avslutat rundan med {currentParticipant.score} poäng.</p>
          <button
            type="button"
            onClick={handleFinish}
            className="rounded bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
          >
            Se resultat och ställning
          </button>
        </section>
      ) : (
        <>
          {manualMode && !questionVisible && (
            <section className="rounded border border-amber-500/40 bg-amber-900/20 p-5 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-amber-200">Manuellt läge</h2>
                <p className="text-sm text-amber-100">GPS är avstängd. När du är redo att svara på nästa fråga trycker du på knappen nedan.</p>
              </div>
              <button
                type="button"
                onClick={handleStartManualQuestion}
                className="rounded bg-amber-400 px-4 py-2 font-semibold text-black hover:bg-amber-300"
              >
                Starta fråga {Math.min(currentParticipant.currentOrder, orderedQuestions.length)}
              </button>
            </section>
          )}

          {currentQuestion ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-lg border border-cyan-400/40 bg-slate-900/60 p-6">
                <h2 className="text-xl font-semibold mb-3">{currentQuestion.text}</h2>
                <div className="space-y-2">
                  {currentQuestion.options.map((option, index) => (
                    <label
                      key={option}
                      className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2 transition ${selectedOption === index ? 'border-cyan-400 bg-cyan-500/20' : 'border-slate-700 bg-slate-900/40 hover:border-cyan-500/60'}`}
                    >
                      <input
                        type="radio"
                        name="answer"
                        value={index}
                        checked={selectedOption === index}
                        onChange={() => setSelectedOption(index)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={selectedOption === null}
                  className="rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-gray-400"
                >
                  Lämna svar
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="rounded bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600"
                >
                  Avsluta runda
                </button>
              </div>
              {feedback && (
                <div className={`rounded px-4 py-3 text-sm ${feedback.includes('Rätt') ? 'bg-emerald-900/40 text-emerald-100 border border-emerald-500/40' : 'bg-amber-900/40 text-amber-100 border border-amber-500/40'}`}>
                  {feedback}
                </div>
              )}
            </form>
          ) : null}

          <section className="rounded border border-slate-700 bg-slate-900/50 p-4">
            <h2 className="text-lg font-semibold mb-2">Ställning</h2>
            <ul className="space-y-1 text-sm text-gray-300">
              {participantsSnapshot.length === 0 && <li>Inga andra svar ännu.</li>}
              {participantsSnapshot.map((participant, index) => {
                const statusMeta = describeParticipantStatus(participant.status);
                return (
                  <li key={participant.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${statusMeta.dotClass}`} />
                      <span>{index + 1}. {participant.alias}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>{participant.score} / {orderedQuestions.length}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.pillClass}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
};

export default PlayRunPage;

