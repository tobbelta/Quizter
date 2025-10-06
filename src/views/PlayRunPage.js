/**
 * Spelvy där deltagaren ser karta, frågor och status.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRun } from '../context/RunContext';
import { questionService } from '../services/questionService';
import RunMap from '../components/run/RunMap';
import useRunLocation from '../hooks/useRunLocation';
import { calculateDistanceMeters, formatDistance } from '../utils/geo';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';

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
  const {
    trackingEnabled,
    coords
  } = useRunLocation();

  const [selectedOption, setSelectedOption] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');
  const [questionVisible, setQuestionVisible] = useState(true);
  const [distanceToCheckpoint, setDistanceToCheckpoint] = useState(null);
  const [distanceToStart, setDistanceToStart] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    // Använd användarens språkval från localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem('routequest:language') || 'sv';
    }
    return 'sv';
  });

  // Lyssna på ändringar i localStorage (när användaren byter språk i menyn)
  useEffect(() => {
    const handleStorageChange = () => {
      const newLanguage = localStorage.getItem('routequest:language') || 'sv';
      console.log('[PlayRunPage] Språk ändrat till:', newLanguage);
      setSelectedLanguage(newLanguage);
    };

    // Lyssna på storage events (fungerar mellan flikar)
    window.addEventListener('storage', handleStorageChange);

    // Lyssna på custom event (för samma flik)
    window.addEventListener('languageChange', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('languageChange', handleStorageChange);
    };
  }, []);

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

  const manualMode = !trackingEnabled;

  useEffect(() => {
    setSelectedOption(null);
    setFeedback(null);
    setQuestionVisible(!manualMode);
  }, [currentParticipant?.currentOrder, manualMode]);


  const orderedQuestions = useMemo(() => {
    if (!currentRun) return [];
    console.log('[PlayRunPage] Hämtar frågor med språk:', selectedLanguage);
    return currentRun.questionIds.map((id) => {
      const question = questionService.getByIdForLanguage(id, selectedLanguage);
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
      return question;
    });
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

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">Något gick fel</h1>
        <p className="text-red-300 mb-4">{error}</p>
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

  return (
    <div className="h-dvh flex flex-col">
      {/*
        Aggressiv CSS-override för att tvinga kartan till full höjd på mobila enheter.
        Detta är nödvändigt för att vinna över en !important-regel i den globala CSS:en.
      */}
      <style>
        {`
          @media (max-width: 768px) { .leaflet-container { height: 100% !important; } }
        `}
      </style>

      {/* Gemensam Header-komponent */}
      <Header title={`${currentRun.name} (${Math.min(currentParticipant?.currentOrder || 1, orderedQuestions.length)}/${orderedQuestions.length})`} />

      {/* Spacer för fixed header */}
      <div className="h-16"></div>

      {/* Huvudinnehåll - karta */}
      <main className="flex-1 relative overflow-hidden">
        <RunMap
          checkpoints={currentRun.checkpoints || []}
          userPosition={coords}
          activeOrder={currentOrderIndex}
          answeredCount={answeredCount}
          route={currentRun.route}
          startPoint={currentRun.startPoint}
          manualMode={!trackingEnabled}
          onCheckpointClick={(order) => {
            console.log(`🗺️ Användare klickade på checkpoint ${order + 1}`);
            setQuestionVisible(true);
          }}
        />

        {/* Frågeoverlay över kartan */}
        {currentQuestion && (
          <div className="absolute inset-x-4 bottom-4 z-30">
            <form onSubmit={handleSubmit} className="bg-slate-900/95 backdrop-blur-sm rounded-xl border border-cyan-400/40 p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-white flex-1">{currentQuestion.text}</h2>
                <div className="ml-3 flex items-center gap-2">
                  {currentQuestion.category && (
                    <span className="inline-flex items-center rounded-full bg-purple-500/20 px-2.5 py-0.5 text-xs font-medium text-purple-200">
                      {currentQuestion.category}
                    </span>
                  )}
                  <span className="inline-flex items-center rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-medium text-cyan-200">
                    {selectedLanguage.toUpperCase()}
                  </span>
                </div>
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

      <Footer />
    </div>
  );
};

export default PlayRunPage;
