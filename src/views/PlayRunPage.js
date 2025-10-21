/**
 * Spelvy där deltagaren ser karta, frågor och status.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useRun } from '../context/RunContext';
import { questionService } from '../services/questionService';
import RunMap from '../components/run/RunMap';
import useRunLocation from '../hooks/useRunLocation';
import useDistanceTracking from '../hooks/useDistanceTracking';
import useElapsedTime from '../hooks/useElapsedTime';
import useTimeQuestionTrigger from '../hooks/useTimeQuestionTrigger';
import useAppVisibility from '../hooks/useAppVisibility';
import backgroundLocationService from '../services/backgroundLocationService';
import { calculateDistanceMeters, formatDistance } from '../utils/geo';
import Header from '../components/layout/Header';
import ReportQuestionDialog from '../components/shared/ReportQuestionDialog';
import { buildJoinLink } from '../utils/joinLink';
import useQRCode from '../hooks/useQRCode';
import QRCodeDisplay from '../components/shared/QRCodeDisplay';
import {
  ensureNotificationPermissions,
  notifyQuestionAvailable,
  scheduleNativeQuestionNotification,
  cancelNativeNotification
} from '../services/questionNotificationService';

const PROXIMITY_THRESHOLD_METERS = 25;
const IN_APP_ALERT_SOUND_PATH = (() => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/sounds/question_alert.wav`;
  }
  return '/sounds/question_alert.wav';
})();

let inAppAlertAudio = null;
const playInAppAlertSound = () => {
  if (typeof Audio === 'undefined') {
    return;
  }
  try {
    if (!inAppAlertAudio) {
      inAppAlertAudio = new Audio(IN_APP_ALERT_SOUND_PATH);
      inAppAlertAudio.preload = 'auto';
    }
    inAppAlertAudio.currentTime = 0;
    inAppAlertAudio.play().catch((err) => {
      console.warn('[PlayRunPage] Could not play in-app alert sound', err);
      inAppAlertAudio = null;
    });
  } catch (error) {
    console.warn('[PlayRunPage] Failed to play in-app alert sound:', error);
  }
};

const formatCountdown = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0:00';
  }

  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

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
  const [questionVisible, setQuestionVisible] = useState(false);
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
  const scheduledTimeNotificationRef = useRef(null);
  const isDistanceBased = currentRun?.type === 'distance-based';
  const isTimeBased = currentRun?.type === 'time-based';
  const isAppForeground = useAppVisibility();

  const cancelNativeTimeNotification = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const scheduled = scheduledTimeNotificationRef.current;
    if (!scheduled) {
      return;
    }

    try {
      await cancelNativeNotification(scheduled.id);
    } catch (error) {
      console.warn('[PlayRunPage] Could not cancel scheduled native notification:', error);
    } finally {
      scheduledTimeNotificationRef.current = null;
    }
  }, []); // Empty deps - only uses refs and imported function

  // Detektera om vi kom från en notifiering (via URL parameter)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('fromNotification') === 'true') {
      console.log('[PlayRunPage] Opened from notification via URL parameter, showing question');
      setQuestionVisible(true);
      
      // Rensa URL parametern utan att ladda om sidan
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Förhindra att service worker navigerar oss bort från sidan när vi redan är här
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Sätt en flag som service worker kan kolla
    sessionStorage.setItem('currentPlayRunId', runId);
    
    return () => {
      sessionStorage.removeItem('currentPlayRunId');
    };
  }, [runId]);

  useEffect(() => {
    notifiedQuestionIdsRef.current.clear();
    
    // Stäng alla gamla notifieringar vid mount (kan finnas kvar från innan reload)
    if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
      console.log('[PlayRunPage] Attempting to close old notifications...');
      navigator.serviceWorker.ready.then(registration => {
        if ('getNotifications' in registration) {
          return registration.getNotifications();
        }
        console.log('[PlayRunPage] getNotifications not available');
        return [];
      }).then(notifications => {
        console.log('[PlayRunPage] Found', notifications.length, 'old notifications, closing them');
        notifications.forEach(notification => {
          console.log('[PlayRunPage] Closing notification:', notification.data?.questionId);
          notification.close();
        });
      }).catch(err => {
        console.warn('[PlayRunPage] Could not close old notifications:', err);
      });
    }
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

  // Lyssna på native notification clicks
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    const listener = LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
      console.log('[PlayRunPage] Native notification clicked:', notification);
      
      // Visa frågan när användaren klickar på notifieringen
      setQuestionVisible(true);
      
      // Om det finns extra data, hantera det
      if (notification.notification?.extra?.questionId) {
        notifiedQuestionIdsRef.current.add(notification.notification.extra.questionId);
      }
    });

    return () => {
      listener.remove();
    };
  }, []);

  const requiresTracking = currentRun?.type === 'route-based' || currentRun?.type === 'distance-based';
  const manualMode = requiresTracking ? !trackingEnabled : false;
  const isNative = Capacitor.isNativePlatform();

  // Timer för att mäta total tid
  const { formattedTime } = useElapsedTime(true);

  // State för background tracking (native only)
  const [backgroundDistance, setBackgroundDistance] = useState(0);
  const [backgroundDistanceToNext, setBackgroundDistanceToNext] = useState(0);

  useEffect(() => {
    setSelectedOption(null);
    setFeedback(null);
    if (isTimeBased) {
      setQuestionVisible(false);
    } else {
      setQuestionVisible(!manualMode);
    }
  }, [currentParticipant?.currentOrder, isTimeBased, manualMode]);


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

  // Schedule native notification for time-based questions
  // Must be defined AFTER orderedQuestions and totalQuestions
  const scheduleNativeTimeNotification = useCallback(async (targetTimestamp, questionIndex) => {
    if (!Capacitor.isNativePlatform() || !isTimeBased) {
      return;
    }

    const question = orderedQuestions[questionIndex];
    if (!question) {
      console.warn('[PlayRunPage] Cannot schedule native timer notification, question missing for index', questionIndex);
      return;
    }

    const now = Date.now();
    if (targetTimestamp <= now + 500) {
      console.log('[PlayRunPage] Skipping native scheduling, target timestamp already passed or too close');
      scheduledTimeNotificationRef.current = null;
      return;
    }

    await cancelNativeTimeNotification();

    const notificationId = await scheduleNativeQuestionNotification(
      {
        questionId: question.id,
        questionText: question.text,
        questionOrder: questionIndex + 1,
        totalQuestions,
        mode: 'time',
        runId,
        minutesBetweenQuestions: currentRun?.minutesBetweenQuestions,
      },
      targetTimestamp,
      {
        questionIndex,
        type: 'time-question',
        runId,
      }
    );

    if (notificationId !== null) {
      scheduledTimeNotificationRef.current = {
        id: notificationId,
        questionId: question.id ?? `time-${questionIndex}`,
      };
    }
  }, [
    cancelNativeTimeNotification,
    currentRun?.minutesBetweenQuestions,
    isTimeBased,
    orderedQuestions,
    runId,
    totalQuestions
  ]);

  const currentOrderIndex = useMemo(() => {
    if (!currentParticipant) return 0;
    return Math.max(0, currentParticipant.currentOrder - 1);
  }, [currentParticipant]);

  // Spåra distans för ALLA typer (men bara trigga frågor för distance-based)
  const distanceTracking = useDistanceTracking({
    coords,
    trackingEnabled: trackingEnabled && !isNative, // Använd inte hook på native
    distanceBetweenQuestions: currentRun?.distanceBetweenQuestions || 500,
    currentQuestionIndex: currentOrderIndex,
    totalQuestions: totalQuestions
  });
  const { resetQuestionDistance } = distanceTracking;

  const {
    shouldShowQuestion: timedShouldShowQuestion,
    timeRemainingMs,
    armNextQuestion: scheduleNextTimedQuestion,
    showQuestionNow: showTimedQuestionNow,
    resetForNextQuestion: resetTimedQuestion,
    wasTriggeredByTimer
  } = useTimeQuestionTrigger({
    isEnabled: Boolean(isTimeBased),
    intervalMinutes: currentRun?.minutesBetweenQuestions || 5,
    currentQuestionIndex: currentOrderIndex,
    totalQuestions,
    onTimerScheduled: scheduleNativeTimeNotification,
    onTimerCleared: cancelNativeTimeNotification
  });

  const formattedTimeRemaining = useMemo(() => formatCountdown(timeRemainingMs), [timeRemainingMs]);

  // Cleanup: rensa gamla sessionStorage för besvarade frågor vid mount/reload
  useEffect(() => {
    if (!isTimeBased || currentOrderIndex === 0) {
      return;
    }
    
    // Om currentOrderIndex > 0 betyder det att användaren redan svarat på tidigare frågor
    // Rensa sessionStorage för dessa (men INTE för currentOrderIndex - den pågår!)
    console.log('[PlayRunPage] Cleaning up sessionStorage for answered questions (0 to', currentOrderIndex - 1, ')');
    for (let i = 0; i < currentOrderIndex; i++) {
      const storageKey = `timeQuestionTrigger_q${i}`;
      sessionStorage.removeItem(storageKey);
    }
  }, [runId, isTimeBased, currentOrderIndex]);

  // Schemalägger nästa time-based fråga när användaren svarar (currentOrderIndex ökar)
  useEffect(() => {
    if (!isTimeBased || currentOrderIndex === 0) {
      return;
    }
    
    // När currentOrderIndex ökar (efter att ha svarat), schemalägg nästa fråga
    if (currentOrderIndex > 0 && currentOrderIndex < totalQuestions) {
      console.log('[PlayRunPage] Scheduling next timed question after answer, index:', currentOrderIndex);
      scheduleNextTimedQuestion();
    }
  }, [isTimeBased, currentOrderIndex, totalQuestions, scheduleNextTimedQuestion]);

  // Lyssna på web notification clicks (via service worker)
  useEffect(() => {
    if (Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) {
      return undefined;
    }

    const handleServiceWorkerMessage = (event) => {
      console.log('[PlayRunPage] Service worker message received:', event.data);
      
      if (event.data?.type === 'SHOW_QUESTION') {
        // Service worker hittade exakt samma run - visa bara frågan
        const notificationQuestionId = event.data?.data?.questionId;
        const currentQuestionId = orderedQuestions[currentOrderIndex]?.id;
        
        console.log('[PlayRunPage] SHOW_QUESTION received, notification questionId:', notificationQuestionId, 'current:', currentQuestionId);
        
        // Kontrollera om notifieringen är för rätt fråga (inte en gammal notifiering)
        if (notificationQuestionId !== currentQuestionId) {
          console.log('[PlayRunPage] ⚠️ Ignoring old notification - question already answered');
          return;
        }
        
        console.log('[PlayRunPage] Showing question without navigation');
        setQuestionVisible(true);
        if (isTimeBased) {
          showTimedQuestionNow();
        }
        
        if (notificationQuestionId) {
          notifiedQuestionIdsRef.current.add(notificationQuestionId);
        }
        return;
      }
      
      if (event.data?.type === 'NAVIGATE_TO') {
        // Service worker vill att vi ska navigera till en annan URL
        const targetUrl = event.data.url;
        console.log('[PlayRunPage] NAVIGATE_TO received, target:', targetUrl);
        
        // Kontrollera om vi redan är på samma run - då ska vi INTE navigera
        const currentPath = window.location.pathname;
        const targetPath = new URL(targetUrl).pathname;
        
        // Om vi redan är på samma run-sida, visa bara frågan istället för att navigera
        if (currentPath === targetPath || 
            (currentPath === `/play/${runId}` || currentPath === `/run/${runId}/play`)) {
          console.log('[PlayRunPage] Already on target page, showing question instead of navigating');
          setQuestionVisible(true);
          if (isTimeBased) {
            showTimedQuestionNow();
          }
          if (event.data?.data?.questionId) {
            notifiedQuestionIdsRef.current.add(event.data.data.questionId);
          }
          return;
        }
        
        console.log('[PlayRunPage] Navigating to different page:', targetUrl);
        window.location.href = targetUrl;
        return;
      }
      
      if (event.data?.type === 'NOTIFICATION_CLICKED') {
        // Fallback - visa frågan
        console.log('[PlayRunPage] Web notification clicked, showing question');
        setQuestionVisible(true);
        if (isTimeBased) {
          showTimedQuestionNow();
        }
        
        if (event.data?.data?.questionId) {
          notifiedQuestionIdsRef.current.add(event.data.data.questionId);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [isTimeBased, showTimedQuestionNow, runId, currentOrderIndex, orderedQuestions]);

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

        if (isAppForeground) {
          playInAppAlertSound();
        }
      },
      getNotificationPayload: () => {
        const question = orderedQuestions[currentOrderIndex];
        if (!question) {
          return null;
        }

        return {
          questionId: question.id,
          runId,
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
  }, [isNative, isDistanceBased, trackingEnabled, currentRun, currentOrderIndex, orderedQuestions, totalQuestions, runId, isAppForeground]);

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
  const shouldShowQuestion = isTimeBased
    ? timedShouldShowQuestion
    : isDistanceBased
      ? (manualMode && questionVisible) || distanceTracking.shouldShowQuestion  // Distance-based: avstånd eller manuell
      : (manualMode && questionVisible) || (!manualMode && nearCheckpoint);     // Route-baserad: checkpoint eller manuell

  const currentQuestion = shouldShowQuestion
    ? orderedQuestions[currentOrderIndex] || null
    : null;

  useEffect(() => {
    if (!isTimeBased || !timedShouldShowQuestion) {
      return;
    }

    console.log('[PlayRunPage] timedShouldShowQuestion=true, currentOrderIndex:', currentOrderIndex, 'wasTriggeredByTimer:', wasTriggeredByTimer, 'remaining:', timeRemainingMs);
    
    // VIKTIG: Skicka BARA notifiering om shouldShowQuestion sattes av timern som gick ut
    // Om shouldShowQuestion=true men wasTriggeredByTimer=false är det en race condition vid mount
    if (!wasTriggeredByTimer) {
      console.log('[PlayRunPage] NOT sending notification - shouldShowQuestion not triggered by timer, race condition at mount');
      setQuestionVisible(true);
      return;
    }
    
    console.log('[PlayRunPage] ✅ Timer triggered shouldShowQuestion');
    
    // Kontrollera att komponenten fortfarande är monterad och användaren är på sidan
    const isOnPlayPage = window.location.pathname.includes('/run/') || window.location.pathname.includes('/play/');
    if (!isOnPlayPage) {
      console.log('[PlayRunPage] NOT sending notification - user not on play page, path:', window.location.pathname);
      return;
    }
    
    const hadScheduledNativeNotification = Boolean(scheduledTimeNotificationRef.current);
    cancelNativeTimeNotification();

    // Appens synlighet hanteras via useAppVisibility-hooken
    setQuestionVisible(true);

    const nextQuestion = orderedQuestions[currentOrderIndex] || null;
    const questionId = nextQuestion?.id;

    // Skicka notifiering ENDAST när tiden faktiskt går ut (inte när frågan skapas)
    if (questionId && !notifiedQuestionIdsRef.current.has(questionId)) {
      notifiedQuestionIdsRef.current.add(questionId);
      
      if (isAppForeground) {
        // Appen är i förgrunden - ge ljud/haptik utan visuell banner
        console.log('[PlayRunPage] 🟢 App in foreground, playing sound + haptics');

        playInAppAlertSound();

        if (Capacitor.isNativePlatform()) {
          Haptics.impact({ style: ImpactStyle.Heavy }).catch(err =>
            console.warn('[PlayRunPage] Could not trigger haptics:', err)
          );
        } else if (navigator.vibrate) {
          navigator.vibrate([150, 75, 150]);
        }
      } else {
        // Appen är i bakgrunden - skicka riktig notifikation
        console.log('[PlayRunPage] 📢 App in background, notification handling');

        if (!hadScheduledNativeNotification) {
          notifyQuestionAvailable({
            questionId,
            runId,
            questionTitle: `${currentRun?.name || 'GeoQuest'} - Fraga ${currentOrderIndex + 1}/${totalQuestions}`,
            questionText: nextQuestion?.text || '',
            options: nextQuestion?.options || [],
            questionOrder: currentOrderIndex + 1,
            totalQuestions: totalQuestions,
            mode: 'time',
            minutesBetweenQuestions: currentRun?.minutesBetweenQuestions
          });

          if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
          }
        }
      }
    } else {
      console.log('[PlayRunPage] NOT sending notification - already notified or no questionId:', questionId, 'has?', notifiedQuestionIdsRef.current.has(questionId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isTimeBased,
    timedShouldShowQuestion,
    orderedQuestions,
    currentOrderIndex,
    totalQuestions,
    currentRun?.name,
    currentRun?.minutesBetweenQuestions,
    runId,
    cancelNativeTimeNotification,
    isAppForeground
    // timeRemainingMs intentionally omitted - we only read it, don't want to re-run on every tick
  ]);

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
        runId,
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
      // Använd service worker om tillgänglig
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification('Ny fråga!', {
            body: `Du har gått ${currentRun?.distanceBetweenQuestions || 500}m. Dags att svara!`,
            icon: '/favicon.ico',
            tag: 'question-trigger',
          }).catch(err => console.warn('[PlayRunPage] Kunde inte visa notifikation:', err));
        });
      } else {
        // Fallback till vanlig Notification
        try {
          new Notification('Ny fråga!', {
            body: `Du har gått ${currentRun?.distanceBetweenQuestions || 500}m. Dags att svara!`,
            icon: '/favicon.ico',
            tag: 'question-trigger',
          });
        } catch (err) {
          console.warn('[PlayRunPage] Kunde inte visa notifikation:', err);
        }
      }
    }

    playInAppAlertSound();
  }, [
    distanceTracking.shouldShowQuestion,
    isDistanceBased,
    isNative,
    orderedQuestions,
    currentOrderIndex,
    totalQuestions,
    currentRun?.name,
    currentRun?.distanceBetweenQuestions,
    runId,
  ]);

  useEffect(() => {
    if (isDistanceBased || isTimeBased) {
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

    if (isAppForeground) {
      playInAppAlertSound();

      if (Capacitor.isNativePlatform()) {
        Haptics.impact({ style: ImpactStyle.Heavy }).catch((err) => {
          console.warn('[PlayRunPage] Could not trigger haptics for route trigger:', err);
        });
      } else if (navigator.vibrate) {
        navigator.vibrate([150, 75, 150]);
      }
    } else {
      notifyQuestionAvailable({
        questionId,
        runId,
        questionTitle: `${currentRun?.name || 'GeoQuest'} - Fraga ${currentOrderIndex + 1}/${totalQuestions}`,
        questionText: currentQuestion.text,
        options: currentQuestion.options,
        order: currentOrderIndex + 1,
        total: totalQuestions,
        mode: 'route',
      });

      if (navigator.vibrate && !Capacitor.isNativePlatform()) {
        navigator.vibrate([200, 100, 200]);
      }
    }
  }, [
    isDistanceBased,
    isTimeBased,
    shouldShowQuestion,
    currentQuestion,
    currentOrderIndex,
    totalQuestions,
    currentRun?.name,
    runId,
    isAppForeground
  ]);

  const answeredCount = currentParticipant?.answers?.length || 0;
  const hasAnsweredAll = answeredCount >= totalQuestions;
  const requiresReturnToStart = currentRun?.type === 'route-based' && !manualMode;
  const hasCompleted = hasAnsweredAll && (!requiresReturnToStart || nearStartPoint);

  /** Skickar in valt svar och visar feedback kortvarigt. */
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (selectedOption === null || !currentQuestion) {
      return;
    }
    
    // För time-based runs: rensa timer och shouldShowQuestion för DENNA fråga innan vi svarar
    if (isTimeBased) {
      const storageKey = `timeQuestionTrigger_q${currentOrderIndex}`;
      sessionStorage.removeItem(storageKey);
      console.log('[PlayRunPage] Cleared timer for answered question', currentOrderIndex);
      
      // VIKTIGT: Rensa shouldShowQuestion INNAN currentOrderIndex ökar
      resetTimedQuestion();
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
    // För time-based runs hanteras scheduling automatiskt i useEffect
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
          className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
          title="Dela runda"
          aria-label="Dela runda"
        >
          <svg 
            className="w-5 h-5 text-gray-300" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" 
            />
          </svg>
        </button>
      </Header>

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

        {/* Stats overlay - flyttad till footer för time-based, behålls på toppen för andra typer */}
        {!isTimeBased && (trackingEnabled) && (
          <div className="absolute top-4 left-4 right-4 z-20">
            <div className="bg-slate-900/90 backdrop-blur-sm rounded-lg border border-cyan-400/40 p-3 shadow-lg">
              <div className="flex items-center justify-between gap-4 text-sm">
                {/* Total distans (visa endast om tracking är aktiv) */}
                {trackingEnabled && (
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">📍</span>
                    <span className="text-white font-medium">
                      {(() => {
                        const distance = isNative ? backgroundDistance : distanceTracking.totalDistance;
                        return distance >= 1000
                          ? `${(distance / 1000).toFixed(2)} km`
                          : `${Math.round(distance)} m`;
                      })()}
                    </span>
                  </div>
                )}

                {/* Tid */}
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400">⏱️</span>
                  <span className="text-white font-medium">
                    {formattedTime}
                  </span>
                </div>

                {/* Distans till nästa (endast distance-based) */}
                {trackingEnabled && isDistanceBased && (
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400">🎯</span>
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
              {trackingEnabled && isDistanceBased && (
                <div className="mt-3 h-2 rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        ((isNative ? backgroundDistanceToNext : distanceTracking.distanceToNextQuestion) /
                          (currentRun.distanceBetweenQuestions || 1)) * 100
                      )}%`
                    }}
                  ></div>
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

      {/* Footer stats för time-based runs */}
      {isTimeBased && (
        <div className="bg-slate-900/95 backdrop-blur-sm border-t border-cyan-400/40 p-4 shadow-lg">
          <div className="flex items-center justify-around gap-4 text-sm max-w-2xl mx-auto">
            {/* Tid till nästa fråga */}
            <div className="flex flex-col items-center">
              <span className="text-purple-400 text-xs mb-1">Nästa fråga</span>
              <span className="text-white font-bold text-xl">
                {hasAnsweredAll
                  ? '✓ Klar'
                  : timedShouldShowQuestion
                    ? 'Tillgänglig!'
                    : formattedTimeRemaining}
              </span>
            </div>
            
            {/* Total tid */}
            <div className="flex flex-col items-center">
              <span className="text-yellow-400 text-xs mb-1">Total tid</span>
              <span className="text-white font-bold text-xl">{formattedTime}</span>
            </div>
          </div>
        </div>
      )}

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



