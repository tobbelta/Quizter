/**
 * Spelvy där deltagaren ser karta, frågor och status.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useRun } from '../context/RunContext';
import { questionService } from '../services/questionService';
import RunMap from '../components/run/RunMap';
import useRunLocation from '../hooks/useRunLocation';
import useDistanceTracking from '../hooks/useDistanceTracking';
import useElapsedTime from '../hooks/useElapsedTime';
import backgroundLocationService from '../services/backgroundLocationService';
import { calculateDistanceMeters, formatDistance } from '../utils/geo';
import Header from '../components/layout/Header';
import ReportQuestionDialog from '../components/shared/ReportQuestionDialog';
import { buildJoinLink } from '../utils/joinLink';
import useQRCode from '../hooks/useQRCode';
import QRCodeDisplay from '../components/shared/QRCodeDisplay';
import { ensureNotificationPermissions, notifyQuestionAvailable } from '../services/questionNotificationService';

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
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [questionToReport, setQuestionToReport] = useState(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    // Använd användarens språkval från localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem('routequest:language') || 'sv';
    }
    return 'sv';
  });
  const notifiedQuestionIdsRef = useRef(new Set());
  const handlingNotificationRef = useRef(false);

  useEffect(() => {
    notifiedQuestionIdsRef.current.clear();
  }, [runId]);

  // Lyssna på ändringar i localStorage (när användaren byter språk i menyn)
  useEffect(() => {
    const handleStorageChange = () => {
      const newLanguage = localStorage.getItem('routequest:language') || 'sv';
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
    
    if (!Capacitor.isNativePlatform()) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } else {
      ensureNotificationPermissions().catch((err) => {
        console.warn('[PlayRunPage] Could not ensure notification permissions', err);
      });
    }
  }, [refreshParticipants]);

  const manualMode = !trackingEnabled;
  const isNative = Capacitor.isNativePlatform();

  // Timer för att mäta total tid
  const { formattedTime } = useElapsedTime(true);

  // State för background tracking (native only)
  const [backgroundDistance, setBackgroundDistance] = useState(0);
  const [backgroundDistanceToNext, setBackgroundDistanceToNext] = useState(0);

  useEffect(() => {
    setSelectedOption(null);
    setFeedback(null);
    setQuestionVisible(!manualMode);
  }, [currentParticipant?.currentOrder, manualMode]);


  const orderedQuestions = useMemo(() => {
    if (!currentRun) return [];
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
  const totalQuestions = orderedQuestions.length;

  const currentOrderIndex = useMemo(() => {
    if (!currentParticipant) return 0;
    return Math.max(0, currentParticipant.currentOrder - 1);
  }, [currentParticipant]);

  // Distans-baserad tracking (endast för distance-based runs)
  const isDistanceBased = currentRun?.type === 'distance-based';
  
  // Spåra distans för ALLA typer (men bara trigga frågor för distance-based)
  const distanceTracking = useDistanceTracking({
    coords,
    trackingEnabled: trackingEnabled && !isNative, // Använd inte hook på native
    distanceBetweenQuestions: currentRun?.distanceBetweenQuestions || 500,
    currentQuestionIndex: currentOrderIndex,
    totalQuestions: totalQuestions
  });
  const { resetQuestionDistance } = distanceTracking;

  // Background location tracking för native apps
  useEffect(() => {
    if (!isNative || !isDistanceBased || !trackingEnabled || !currentRun) {
      return;
    }

    console.log('[PlayRunPage] Starting background location tracking (native)');

    // Starta background tracking
    backgroundLocationService.startTracking({
      distanceBetweenQuestions: currentRun.distanceBetweenQuestions || 500,
      onDistanceReached: (data) => {
        console.log('[PlayRunPage] Distance reached!', data);
        setQuestionVisible(true);
        const upcomingQuestion = orderedQuestions[currentOrderIndex] || null;
        if (upcomingQuestion?.id) {
          notifiedQuestionIdsRef.current.add(upcomingQuestion.id);
        }
      },
      getNotificationPayload: () => {
        const question = orderedQuestions[currentOrderIndex];
        if (!question) {
          return null;
        }

        return {
          questionId: question.id,
          questionTitle: `${currentRun?.name || 'GeoQuest'} - Fraga ${currentOrderIndex + 1}/${totalQuestions}`,
          questionText: question.text,
          options: question.options,
          order: currentOrderIndex + 1,
          total: totalQuestions,
          mode: 'distance',
        };
      },
    });

    // Lyssna på distance updates för UI
    const unsubscribe = backgroundLocationService.addListener((data) => {
      setBackgroundDistance(data.totalDistance);
      setBackgroundDistanceToNext(data.distanceSinceLastQuestion);
    });

    // Cleanup
    return () => {
      console.log('[PlayRunPage] Stopping background location tracking');
      backgroundLocationService.stopTracking();
      unsubscribe();
    };
  }, [isNative, isDistanceBased, trackingEnabled, currentRun, currentOrderIndex, orderedQuestions, totalQuestions]);

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

  // QR-kod för delning
  const joinLink = currentRun ? buildJoinLink(currentRun.joinCode) : '';
  const { dataUrl, isLoading: qrLoading, error: qrError } = useQRCode(joinLink, 280);

  // Bestäm om frågan ska visas baserat på läge och närhet.
  const shouldShowQuestion = isDistanceBased
    ? (manualMode && questionVisible) || distanceTracking.shouldShowQuestion  // Distance-based: avstånd eller manuell
    : (manualMode && questionVisible) || (!manualMode && nearCheckpoint);     // Route-based: checkpoint eller manuell

  const currentQuestion = shouldShowQuestion
    ? orderedQuestions[currentOrderIndex] || null
    : null;

  useEffect(() => {
    if (!isDistanceBased || isNative || !distanceTracking.shouldShowQuestion) {
      return;
    }

    setQuestionVisible(true);

    const nextQuestion = orderedQuestions[currentOrderIndex] || null;
    const questionId = nextQuestion?.id;

    if (questionId && !notifiedQuestionIdsRef.current.has(questionId)) {
      notifiedQuestionIdsRef.current.add(questionId);
      notifyQuestionAvailable({
        questionId,
        questionTitle: `${currentRun?.name || 'GeoQuest'} - Fraga ${currentOrderIndex + 1}/${totalQuestions}`,
        questionText: nextQuestion?.text || '',
        options: nextQuestion?.options || [],
        order: currentOrderIndex + 1,
        total: totalQuestions,
        mode: 'distance',
      });
    }

    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Ny fraga!', {
        body: `Du har gatt ${currentRun?.distanceBetweenQuestions || 500}m. Dags att svara!`,
        icon: '/favicon.ico',
        tag: 'question-trigger',
      });
    }

    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiDcIF2W57OScTgwOUKXh8LljHA==');
    audio.play().catch(() => console.log('Could not play sound'));
  }, [
    distanceTracking.shouldShowQuestion,
    isDistanceBased,
    isNative,
    orderedQuestions,
    currentOrderIndex,
    totalQuestions,
    currentRun?.name,
    currentRun?.distanceBetweenQuestions,
  ]);

  useEffect(() => {
    if (isDistanceBased) {
      return;
    }

    if (!shouldShowQuestion || !currentQuestion) {
      return;
    }

    const questionId = currentQuestion.id;
    if (!questionId) {
      return;
    }

    if (notifiedQuestionIdsRef.current.has(questionId)) {
      return;
    }

    notifiedQuestionIdsRef.current.add(questionId);

    notifyQuestionAvailable({
      questionId,
      questionTitle: `${currentRun?.name || 'GeoQuest'} - Fraga ${currentOrderIndex + 1}/${totalQuestions}`,
      questionText: currentQuestion.text,
      options: currentQuestion.options,
      order: currentOrderIndex + 1,
      total: totalQuestions,
      mode: 'route',
    });
  }, [isDistanceBased, shouldShowQuestion, currentQuestion, currentOrderIndex, totalQuestions, currentRun?.name]);

  const answeredCount = currentParticipant?.answers?.length || 0;
  const hasAnsweredAll = answeredCount >= totalQuestions;
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

    // Återställ distansräknare för distance-based runs
    if (isDistanceBased) {
      if (isNative) {
        backgroundLocationService.resetDistance();
      } else {
        resetQuestionDistance();
      }

      if (answeredCount + 1 >= totalQuestions) {
        setTimeout(() => {
          handleFinish();
        }, 500);
      }
    }
  };

  /** Markerar rundan som avslutad för nuvarande deltagare. */
  const handleFinish = useCallback(async () => {
    await completeRunForParticipant();
    const runIdentifier = currentRun?.id;
    if (!runIdentifier) {
      return;
    }
    navigate(`/run/${runIdentifier}/results`);
  }, [completeRunForParticipant, currentRun?.id, navigate]);

  const submitAnswerFromNotification = useCallback(async (questionId, answerIndex) => {
    if (questionId == null || typeof answerIndex !== 'number' || Number.isNaN(answerIndex) || answerIndex < 0) {
      console.warn('[PlayRunPage] Invalid notification answer payload', { questionId, answerIndex });
      return;
    }

    const question = orderedQuestions.find((q) => q.id === questionId) || null;
    if (!question) {
      console.warn(`[PlayRunPage] Question ${questionId} not found when answering via notification`);
      return;
    }

    if (handlingNotificationRef.current) {
      return;
    }
    handlingNotificationRef.current = true;

    try {
      await submitAnswer({
        questionId,
        answerIndex,
      });

      setFeedback(null);

      if (isDistanceBased) {
        setQuestionVisible(false);
        if (isNative) {
          backgroundLocationService.resetDistance();
        } else {
          resetQuestionDistance();
        }
      } else if (manualMode) {
        setTimeout(() => setQuestionVisible(false), 500);
      }

      const nextAnswered = answeredCount + 1;
      if (isDistanceBased && nextAnswered >= totalQuestions) {
        setTimeout(() => {
          handleFinish();
        }, 500);
      }
    } catch (notificationError) {
      console.error('[PlayRunPage] Failed to submit answer from notification:', notificationError);
    } finally {
      handlingNotificationRef.current = false;
    }
  }, [
    orderedQuestions,
    submitAnswer,
    isDistanceBased,
    manualMode,
    isNative,
    resetQuestionDistance,
    answeredCount,
    totalQuestions,
    handleFinish,
  ]);

  const handleNotificationAction = useCallback(async (eventDetail) => {
    if (!eventDetail) {
      return;
    }

    const actionId = eventDetail.actionId;
    const notification = eventDetail.notification || {};
    const extra = notification.extra || eventDetail.extra || {};
    const questionId = extra.questionId;
    const optionsList = Array.isArray(extra.options) ? extra.options : [];

    if (actionId === 'open' || actionId === 'tap') {
      if (questionId) {
        notifiedQuestionIdsRef.current.add(questionId);
      }
      setQuestionVisible(true);
      return;
    }

    if (actionId === 'answer') {
      const rawValue = eventDetail.inputValue || '';
      const trimmed = rawValue.trim();
      if (!trimmed) {
        return;
      }

      let parsedIndex = Number.parseInt(trimmed, 10) - 1;
      if (Number.isNaN(parsedIndex) || parsedIndex < 0 || parsedIndex >= optionsList.length) {
        const lowerValue = trimmed.toLowerCase();
        parsedIndex = optionsList.findIndex((option) => {
          if (!option) return false;
          const loweredOption = option.toLowerCase();
          return loweredOption === lowerValue || loweredOption.startsWith(lowerValue);
        });
      }

      if (parsedIndex >= 0) {
        await submitAnswerFromNotification(questionId, parsedIndex);
      } else {
        console.warn('[PlayRunPage] Could not parse notification answer', { rawValue, optionsList });
      }
    }
  }, [submitAnswerFromNotification]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleActionEvent = (event) => {
      Promise.resolve(handleNotificationAction(event.detail)).catch((err) => {
        console.error('[PlayRunPage] Notification action handler error:', err);
      });
    };

    const handleWebClick = (event) => {
      const detail = event?.detail;
      if (detail?.questionId) {
        notifiedQuestionIdsRef.current.add(detail.questionId);
      }
      setQuestionVisible(true);
    };

    window.addEventListener('routequest:notificationAction', handleActionEvent);
    window.addEventListener('routequest:webNotificationClicked', handleWebClick);

    return () => {
      window.removeEventListener('routequest:notificationAction', handleActionEvent);
      window.removeEventListener('routequest:webNotificationClicked', handleWebClick);
    };
  }, [handleNotificationAction]);

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
      <Header 
        title={`${currentRun.name} (${Math.min(currentParticipant?.currentOrder || 1, totalQuestions)}/${totalQuestions})`}
      >
        <button
          onClick={() => setShareDialogOpen(true)}
          className="rounded-lg bg-purple-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-400"
          title="Dela runda"
        >
          📤 Dela
        </button>
      </Header>

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
          gpsTrail={trackingEnabled ? distanceTracking.gpsTrail : null}
          onCheckpointClick={() => {
            setQuestionVisible(true);
          }}
        />

        {/* Stats overlay - Distans och Tid för alla rund-typer */}
        {trackingEnabled && (
          <div className="absolute top-4 left-4 right-4 z-20">
            <div className="bg-slate-900/90 backdrop-blur-sm rounded-lg border border-cyan-400/40 p-3 shadow-lg">
              <div className="flex items-center justify-between gap-4 text-sm">
                {/* Total distans (alla typer) */}
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">🚶</span>
                  <span className="text-white font-medium">
                    {(() => {
                      const distance = isNative ? backgroundDistance : distanceTracking.totalDistance;
                      return distance >= 1000 
                        ? `${(distance / 1000).toFixed(2)} km`
                        : `${Math.round(distance)} m`;
                    })()}
                  </span>
                </div>

                {/* Tid */}
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400">⏱️</span>
                  <span className="text-white font-medium">
                    {formattedTime}
                  </span>
                </div>

                {/* Distans till nästa (endast distance-based) */}
                {isDistanceBased && (
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400">📍</span>
                    <span className="text-white font-medium">
                      {Math.round(
                        isNative 
                          ? backgroundDistanceToNext 
                          : distanceTracking.distanceToNextQuestion
                      )}m
                    </span>
                  </div>
                )}
              </div>

              {/* Progress bar (endast för distance-based) */}
              {isDistanceBased && (
                <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (() => {
                        const distanceToNext = isNative ? backgroundDistanceToNext : distanceTracking.distanceToNextQuestion;
                        return ((currentRun.distanceBetweenQuestions - distanceToNext) / currentRun.distanceBetweenQuestions) * 100;
                      })())}%`
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Frågeoverlay över kartan */}
        {currentQuestion && (
          <div className="absolute inset-x-4 bottom-4 z-30">
            <form onSubmit={handleSubmit} className="bg-slate-900/95 backdrop-blur-sm rounded-xl border border-cyan-400/40 p-4 shadow-xl">
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
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
                <button
                  type="button"
                  onClick={() => {
                    setQuestionToReport({
                      id: currentQuestion.id,
                      text: currentQuestion.text
                    });
                    setReportDialogOpen(true);
                  }}
                  className="text-xs text-yellow-400 hover:text-yellow-300 underline"
                >
                  ⚠️ Rapportera problem med frågan
                </button>
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

      {/* Rapportera fråga dialog */}
      {reportDialogOpen && questionToReport && (
        <ReportQuestionDialog
          questionId={questionToReport.id}
          questionText={questionToReport.text}
          onClose={() => {
            setReportDialogOpen(false);
            setQuestionToReport(null);
          }}
          onReported={() => {
            setReportDialogOpen(false);
            setQuestionToReport(null);
          }}
        />
      )}

      {/* Dela runda dialog */}
      {shareDialogOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShareDialogOpen(false)}
        >
          <div 
            className="bg-slate-900 rounded-2xl border border-cyan-500/40 p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Dela {currentRun.name}</h2>
              <button
                onClick={() => setShareDialogOpen(false)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-gray-300 mb-3">
                  Skanna QR-koden eller använd koden för att bjuda in fler deltagare
                </p>
                <div className="flex justify-center mb-4">
                  <QRCodeDisplay dataUrl={dataUrl} isLoading={qrLoading} error={qrError} />
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg p-4 border border-slate-600">
                <p className="text-xs text-gray-400 mb-1">Anslutningskod:</p>
                <p className="text-2xl font-mono font-bold text-cyan-400 tracking-widest text-center">
                  {currentRun.joinCode}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(currentRun.joinCode);
                    // Optional: visa toast
                  }}
                  className="flex-1 rounded-lg bg-purple-500 px-4 py-2 font-semibold text-white hover:bg-purple-400"
                >
                  Kopiera kod
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(joinLink);
                    // Optional: visa toast
                  }}
                  className="flex-1 rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400"
                >
                  Kopiera länk
                </button>
              </div>

              <div className="text-xs text-gray-400 text-center">
                <a 
                  href={joinLink} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-cyan-400 hover:underline break-all"
                >
                  {joinLink}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayRunPage;



