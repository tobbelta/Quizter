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
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    // Läs från localStorage eller använd svenska som default
    if (typeof window !== 'undefined') {
      return localStorage.getItem('geoquest:language') || 'sv';
    }
    return 'sv';
  });

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
    return currentRun.questionIds.map((id) => {
      const question = questionService.getById(id);
      if (!question) return null;

      // Hämta rätt språkversion
      const langData = question.languages?.[selectedLanguage] ||
                      question.languages?.sv ||
                      question.languages?.[Object.keys(question.languages || {})[0]] ||
                      { text: question.text, options: question.options, explanation: question.explanation };

      return {
        ...question,
        text: langData.text,
        options: langData.options,
        explanation: langData.explanation
      };
    }).filter(Boolean);
  }, [currentRun, selectedLanguage]);

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

  const answeredCount = currentParticipant?.answers?.length || 0;
  const hasCompleted = answeredCount >= orderedQuestions.length;
  const isLastQuestion = answeredCount === orderedQuestions.length - 1;

  /** Skickar in valt svar och visar feedback kortvarigt. */
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

    // Rensa feedback efter 2 sekunder
    setTimeout(() => {
      setFeedback(null);
    }, 2000);

    if (manualMode) {
      setTimeout(() => {
        setQuestionVisible(false);
      }, 2000);
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

  /** Ändrar språk och sparar valet. */
  const handleLanguageChange = (language) => {
    setSelectedLanguage(language);
    if (typeof window !== 'undefined') {
      localStorage.setItem('geoquest:language', language);
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
    <div className="min-h-screen flex flex-col">
      {/* Header med hamburgermeny - ultracompakt */}
      <header className="bg-slate-900 border-b border-slate-700 px-2 py-1.5 flex items-center relative z-50">
        <h1 className="text-sm font-semibold text-white truncate flex-1 mr-2">{currentRun.name}</h1>
        <div className="text-xs text-gray-300 font-medium px-2">
          {Math.min(currentParticipant?.currentOrder || 1, orderedQuestions.length)}/{orderedQuestions.length}
        </div>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-1 rounded hover:bg-slate-700 transition-colors ml-2"
        >
          <div className="w-4 h-4 flex flex-col justify-around">
            <span className={`bg-cyan-400 h-0.5 w-full transition-all ${menuOpen ? 'rotate-45 translate-y-1.5' : ''}`}></span>
            <span className={`bg-cyan-400 h-0.5 w-full transition-all ${menuOpen ? 'opacity-0' : ''}`}></span>
            <span className={`bg-cyan-400 h-0.5 w-full transition-all ${menuOpen ? '-rotate-45 -translate-y-1.5' : ''}`}></span>
          </div>
        </button>
      </header>

      {/* Hamburgermeny - overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)}></div>
          <div className="absolute top-0 left-0 w-80 max-w-full h-full bg-slate-900 shadow-xl">
            <div className="p-4 space-y-6 mt-10">
              {/* Spelinformation */}
              <section>
                <h2 className="text-lg font-semibold text-cyan-200 mb-3">Spelinformation</h2>
                <div className="space-y-2 text-sm">
                  <p className="text-gray-300">Deltagare: {currentParticipant?.alias || currentUser?.name}</p>
                  <p className="text-gray-300">Fråga: {Math.min(currentParticipant?.currentOrder || 1, orderedQuestions.length)} av {orderedQuestions.length}</p>
                  <p className="text-gray-300">Poäng: {currentParticipant?.score || 0}</p>
                </div>
              </section>

              {/* GPS Kontroller */}
              <section>
                <h2 className="text-lg font-semibold text-cyan-200 mb-3">GPS och läge</h2>
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">{statusMessage}</p>
                  <button
                    type="button"
                    onClick={handleToggleTracking}
                    className={trackingEnabled
                      ? 'w-full rounded-lg bg-slate-700 px-4 py-3 font-semibold text-gray-200 hover:bg-slate-600 border border-slate-600'
                      : 'w-full rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-black hover:bg-cyan-400 border border-cyan-400'}
                    disabled={locationStatus === 'unsupported'}
                  >
                    {trackingEnabled ? '📍 Stäng av GPS' : '🌐 Slå på GPS'}
                  </button>

                  {!trackingEnabled && !questionVisible && !hasCompleted && (
                    <button
                      type="button"
                      onClick={() => {
                        handleStartManualQuestion();
                        setMenuOpen(false);
                      }}
                      className="w-full rounded-lg bg-amber-400 px-4 py-3 font-semibold text-black hover:bg-amber-300"
                    >
                      📝 Starta fråga {Math.min(currentParticipant?.currentOrder || 1, orderedQuestions.length)}
                    </button>
                  )}

                  {!trackingEnabled && (
                    <p className="text-xs text-cyan-200">💡 Med GPS av kan du svara på frågor manuellt utan att gå till platsen</p>
                  )}
                </div>
              </section>

              {/* Språkinställningar */}
              <section>
                <h2 className="text-lg font-semibold text-cyan-200 mb-3">Språk</h2>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('sv')}
                    className={`rounded-lg px-3 py-2 font-semibold text-sm ${
                      selectedLanguage === 'sv'
                        ? 'bg-cyan-500 text-black'
                        : 'bg-slate-700 text-gray-200 hover:bg-slate-600'
                    }`}
                  >
                    🇸🇪 Svenska
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('en')}
                    className={`rounded-lg px-3 py-2 font-semibold text-sm ${
                      selectedLanguage === 'en'
                        ? 'bg-cyan-500 text-black'
                        : 'bg-slate-700 text-gray-200 hover:bg-slate-600'
                    }`}
                  >
                    🇬🇧 English
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Frågor visas på valt språk (om tillgängligt)
                </p>
              </section>

              {/* Position info */}
              {nextCheckpoint && distanceToCheckpoint !== null && (
                <section>
                  <h2 className="text-lg font-semibold text-cyan-200 mb-3">Position</h2>
                  <p className="text-sm text-gray-300">
                    Avstånd till nästa checkpoint: <span className="font-semibold">{formatDistance(distanceToCheckpoint)}</span>
                  </p>
                  {trackingEnabled && nearCheckpoint && (
                    <p className="text-sm text-emerald-300 mt-2">Du är nästan framme vid nästa checkpoint!</p>
                  )}
                </section>
              )}

              {/* Avsluta runda */}
              <section className="pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={handleFinish}
                  className="w-full rounded-lg bg-slate-700 px-4 py-3 font-semibold text-gray-200 hover:bg-slate-600"
                >
                  Avsluta runda
                </button>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Huvudinnehåll - karta */}
      <main className="flex-1 relative">
        <RunMap
          checkpoints={currentRun.checkpoints || []}
          userPosition={coords}
          activeOrder={currentOrderIndex}
          answeredCount={answeredCount}
          route={currentRun.route}
        />

        {/* Frågeoverlay över kartan */}
        {currentQuestion && (
          <div className="absolute inset-x-4 bottom-4 z-30">
            <form onSubmit={handleSubmit} className="bg-slate-900/95 backdrop-blur-sm rounded-xl border border-cyan-400/40 p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-white flex-1">{currentQuestion.text}</h2>
                <span className="ml-3 inline-flex items-center rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-medium text-cyan-200">
                  {selectedLanguage.toUpperCase()}
                </span>
              </div>
              <div className="space-y-2 mb-4">
                {currentQuestion.options.map((option, index) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${selectedOption === index ? 'border-cyan-400 bg-cyan-500/20' : 'border-slate-600 bg-slate-800/40 hover:border-cyan-500/60'}`}
                  >
                    <input
                      type="radio"
                      name="answer"
                      value={index}
                      checked={selectedOption === index}
                      onChange={() => setSelectedOption(index)}
                      className="text-cyan-500"
                    />
                    <span className="text-white text-sm">{option}</span>
                  </label>
                ))}
              </div>
              <button
                type="submit"
                disabled={selectedOption === null}
                className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-gray-400"
              >
                Lämna svar
              </button>
              {feedback && (
                <div className={`rounded-lg px-3 py-2 text-sm mt-3 ${feedback.includes('Rätt') ? 'bg-emerald-900/60 text-emerald-100 border border-emerald-500/40' : 'bg-amber-900/60 text-amber-100 border border-amber-500/40'}`}>
                  {feedback}
                </div>
              )}
            </form>
          </div>
        )}

        {/* Avsluta runda-knapp när alla frågor är besvarade */}
        {hasCompleted && (
          <div className="absolute inset-x-4 top-4 z-30">
            <div className="bg-emerald-900/95 backdrop-blur-sm rounded-xl border border-emerald-500/40 p-4 text-center shadow-xl">
              <h2 className="text-lg font-semibold text-emerald-200 mb-2">🎉 Alla frågor besvarade!</h2>
              <p className="text-emerald-100 text-sm mb-3">Du har {currentParticipant?.score || 0} poäng av {orderedQuestions.length} möjliga.</p>
              <button
                type="button"
                onClick={handleFinish}
                className="w-full rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
              >
                Se resultat och ställning
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PlayRunPage;

