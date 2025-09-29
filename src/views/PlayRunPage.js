/**
 * Spelvy där deltagaren ser karta, frågor och status.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRun } from '../context/RunContext';
import { useAuth } from '../context/AuthContext';
import { questionService } from '../services/questionService';
import RunMap from '../components/run/RunMap';
import useRunLocation from '../hooks/useRunLocation';
import { calculateDistanceMeters, formatDistance } from '../utils/geo';
import { paymentService } from '../services/paymentService';

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
    refreshParticipants
  } = useRun();
  const { currentUser } = useAuth();
  const {
    trackingEnabled,
    status: locationStatus,
    coords,
    enableTracking,
    disableTracking
  } = useRunLocation();

  const [selectedOption, setSelectedOption] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [questionVisible, setQuestionVisible] = useState(true);
  const [distanceToCheckpoint, setDistanceToCheckpoint] = useState(null);
  const [distanceToStart, setDistanceToStart] = useState(null);
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

  // Verifiera betalning
  useEffect(() => {
    if (!currentRun) return;

    const verifyPayment = () => {
      // I test-läge: betalning alltid verifierad
      if (paymentService.getTestMode()) {
        setPaymentVerified(true);
        return;
      }

      // Kontrollera localStorage för betalningsstatus
      if (typeof window !== 'undefined') {
        const paymentData = localStorage.getItem(`geoquest:payment:${currentRun.id}`);
        if (paymentData) {
          try {
            const payment = JSON.parse(paymentData);
            // Kontrollera att betalning inte är för gammal (24 timmar)
            const paymentTime = new Date(payment.timestamp);
            const now = new Date();
            const hoursDiff = (now - paymentTime) / (1000 * 60 * 60);

            // Acceptera betalning, test-läge eller överhoppad betalning inom 24 timmar
            if (hoursDiff < 24 && (payment.paymentIntentId || payment.testMode || payment.skipped)) {
              setPaymentVerified(true);
              return;
            }
          } catch (err) {
            console.warn('Kunde inte läsa betalningsdata:', err);
          }
        }
      }

      // Ingen giltig betalning hittad
      setPaymentVerified(false);
      setError('Du måste betala för att delta i denna runda. Gå tillbaka och anslut igen.');
    };

    verifyPayment();
  }, [currentRun]);

  const manualMode = !trackingEnabled || locationStatus === 'denied' || locationStatus === 'unsupported';

  useEffect(() => {
    setSelectedOption(null);
    setFeedback(null);
    setQuestionVisible(!manualMode);
  }, [currentParticipant?.currentOrder, manualMode]);


  const orderedQuestions = useMemo(() => {
    if (!currentRun) return [];
    return currentRun.questionIds.map((id) => {
      const question = questionService.getById(id);
      if (!question) {
        console.warn(`[PlayRunPage] Fråga med ID ${id} hittades inte i questionService`);
        return {
          id: id,
          text: `Fråga ${id} kunde inte laddas`,
          options: ['Ladda om sidan', 'Försök igen', 'Kontakta admin', 'Hoppa över'],
          explanation: 'Denna fråga kunde inte laddas från databasen.',
          correctOption: 0
        };
      }

      // Säkrare språkhantering - försök olika fallbacks
      let langData = null;

      if (question.languages) {
        // Försök önskat språk först
        langData = question.languages[selectedLanguage];

        // Fallback till svenska
        if (!langData) {
          langData = question.languages.sv;
        }

        // Fallback till första tillgängliga språk
        if (!langData) {
          const availableLanguages = Object.keys(question.languages);
          if (availableLanguages.length > 0) {
            langData = question.languages[availableLanguages[0]];
          }
        }
      }

      // Fallback till gamla formatet om inget språk finns
      if (!langData) {
        langData = {
          text: question.text || `Fråga ${id}`,
          options: question.options || ['Alternativ 1', 'Alternativ 2', 'Alternativ 3', 'Alternativ 4'],
          explanation: question.explanation || 'Ingen förklaring tillgänglig'
        };
      }

      return {
        ...question,
        text: langData.text,
        options: langData.options,
        explanation: langData.explanation
      };
    }); // Ta bort .filter(Boolean) så inga frågor försvinner
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

  // Beräkna avstånd till startpunkt
  useEffect(() => {
    if (!coords || !currentRun?.startPoint) {
      setDistanceToStart(null);
      return;
    }
    const distance = calculateDistanceMeters(coords, currentRun.startPoint);
    setDistanceToStart(distance);
  }, [coords, currentRun?.startPoint]);

  const nearCheckpoint = trackingEnabled && distanceToCheckpoint != null && distanceToCheckpoint <= PROXIMITY_THRESHOLD_METERS;
  const nearStartPoint = trackingEnabled && distanceToStart != null && distanceToStart <= PROXIMITY_THRESHOLD_METERS;

  // Bestäm om frågan ska visas baserat på läge och närhet.
  const shouldShowQuestion =
    (manualMode && questionVisible) || // Manuell start
    (!manualMode && nearCheckpoint);   // GPS-läge och nära checkpoint

  const currentQuestion = shouldShowQuestion
    ? orderedQuestions[currentOrderIndex] || null
    : null;

  const answeredCount = currentParticipant?.answers?.length || 0;
  const hasAnsweredAll = answeredCount >= orderedQuestions.length;
  const hasCompleted = hasAnsweredAll && (manualMode || nearStartPoint);

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

  if (error || !paymentVerified) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">
          {!paymentVerified ? 'Betalning krävs' : 'Något gick fel'}
        </h1>
        <p className="text-red-300 mb-4">
          {!paymentVerified
            ? 'Du måste betala för att delta i denna runda.'
            : error
          }
        </p>
        {!paymentVerified && (
          <div className="space-y-3">
            <button
              onClick={() => navigate('/join')}
              className="w-full rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400"
            >
              Gå tillbaka för att betala
            </button>
            {paymentService.getTestMode() && (
              <div className="bg-emerald-900/30 border border-emerald-500/50 rounded p-3 text-center">
                <p className="text-emerald-200 text-sm">
                  🧪 Test-läge är aktiverat - betalning hoppas över automatiskt
                </p>
              </div>
            )}
          </div>
        )}
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
              {(nextCheckpoint || currentRun?.startPoint) && (distanceToCheckpoint !== null || distanceToStart !== null) && (
                <section>
                  <h2 className="text-lg font-semibold text-cyan-200 mb-3">Position</h2>
                  {nextCheckpoint && distanceToCheckpoint !== null && (
                    <p className="text-sm text-gray-300">
                      Avstånd till nästa checkpoint: <span className="font-semibold">{formatDistance(distanceToCheckpoint)}</span>
                    </p>
                  )}
                  {distanceToStart !== null && (
                    <p className="text-sm text-gray-300">
                      Avstånd till startpunkt: <span className="font-semibold">{formatDistance(distanceToStart)}</span>
                    </p>
                  )}
                  {trackingEnabled && nearCheckpoint && (
                    <p className="text-sm text-emerald-300 mt-2">Du är nästan framme vid nästa checkpoint!</p>
                  )}
                  {trackingEnabled && hasAnsweredAll && nearStartPoint && (
                    <p className="text-sm text-emerald-300 mt-2">Du är tillbaka vid startpunkten! Klicka för att se resultat.</p>
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
          startPoint={currentRun.startPoint}
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
        {hasAnsweredAll && (
          <div className="absolute inset-x-4 top-4 z-30">
            <div className={`backdrop-blur-sm rounded-xl border p-4 text-center shadow-xl ${
              hasCompleted
                ? 'bg-emerald-900/95 border-emerald-500/40'
                : 'bg-amber-900/95 border-amber-500/40'
            }`}>
              {hasCompleted ? (
                <>
                  <h2 className="text-lg font-semibold text-emerald-200 mb-2">🎉 Runda avslutad!</h2>
                  <p className="text-emerald-100 text-sm mb-3">Du har svarat på alla frågor och är tillbaka vid startpunkten!</p>
                  <button
                    type="button"
                    onClick={handleFinish}
                    className="w-full rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
                  >
                    Se resultat och ställning
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-amber-200 mb-2">🚶 Alla frågor besvarade!</h2>
                  <p className="text-amber-100 text-sm mb-3">
                    {manualMode
                      ? 'Du har svarat på alla frågor. Klicka för att se resultat.'
                      : 'Gå tillbaka till startpunkten for att avsluta rundan.'
                    }
                  </p>
                  {manualMode ? (
                    <button
                      type="button"
                      onClick={handleFinish}
                      className="w-full rounded-lg bg-amber-500 px-4 py-2 font-semibold text-black hover:bg-amber-400"
                    >
                      Se resultat och ställning
                    </button>
                  ) : (
                    <p className="text-xs text-amber-200">Avstånd till startpunkt: {distanceToStart ? formatDistance(distanceToStart) : '?'}</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PlayRunPage;
