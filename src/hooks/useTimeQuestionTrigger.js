/**
 * Hook som hanterar tidsstyrd frisläppning av frågor.
 * Håller reda på nedräkningen och meddelar när nästa fråga ska visas.
 * Sparar state i sessionStorage för att överleva page reloads.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MS_PER_MINUTE = 60 * 1000;

const clampInterval = (minutes) => {
  if (!Number.isFinite(minutes)) return 1;
  return Math.max(1, Math.min(minutes, 180));
};

// Helper för att spara/ladda timer state
const getStorageKey = (prefix, index) => {
  if (!prefix) return `timeQuestionTrigger_q${index}`;
  return `${prefix}:q${index}`;
};

const getVisibleKey = (prefix) => {
  if (!prefix) return 'timeQuestionTrigger_visible';
  return `${prefix}:visible`;
};

const loadVisibleIndex = (prefix) => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getVisibleKey(prefix));
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
};

const saveVisibleIndex = (prefix, index) => {
  if (typeof window === 'undefined') return;
  try {
    if (!Number.isFinite(index)) return;
    localStorage.setItem(getVisibleKey(prefix), String(index));
  } catch (error) {
    // Ignore
  }
};

const clearVisibleIndex = (prefix) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getVisibleKey(prefix));
  } catch (error) {
    // Ignore
  }
};

const saveTimerState = (storageKeyPrefix, questionIndex, targetTimestamp) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(storageKeyPrefix, questionIndex), targetTimestamp.toString());
  } catch (e) {
    console.warn('[TimeQuestionTrigger] Could not save timer state', e);
  }
};

const loadTimerState = (storageKeyPrefix, questionIndex) => {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(getStorageKey(storageKeyPrefix, questionIndex));
    return saved ? parseInt(saved, 10) : null;
  } catch (e) {
    return null;
  }
};

const clearTimerState = (storageKeyPrefix, questionIndex) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getStorageKey(storageKeyPrefix, questionIndex));
  } catch (e) {
    // Ignore
  }
};

const useTimeQuestionTrigger = ({
  isEnabled,
  isPaused = false,
  intervalMinutes,
  currentQuestionIndex,
  totalQuestions,
  onTimerScheduled,
  onTimerCleared,
  storageKeyPrefix = ''
}) => {
  const safeMinutes = clampInterval(intervalMinutes);
  const intervalMs = useMemo(() => safeMinutes * MS_PER_MINUTE, [safeMinutes]);
  const initialVisibleIndex = useMemo(() => {
    if (!isEnabled) return null;
    return loadVisibleIndex(storageKeyPrefix);
  }, [isEnabled, storageKeyPrefix]);

  const [shouldShowQuestion, setShouldShowQuestion] = useState(() => {
    if (!isEnabled) return true;
    return initialVisibleIndex === currentQuestionIndex;
  });
  const [timeRemainingMs, setTimeRemainingMs] = useState(() => {
    if (!isEnabled) return 0;
    if (initialVisibleIndex === currentQuestionIndex) {
      return 0;
    }
    
    // Försök ladda sparad timer
    const savedTarget = loadTimerState(storageKeyPrefix, currentQuestionIndex);
    if (savedTarget) {
      const remaining = Math.max(0, savedTarget - Date.now());
      return remaining;
    }
    return intervalMs;
  });

  const targetTimestampRef = useRef(null);
  const timeoutRef = useRef(null);
  const tickerRef = useRef(null);
  const questionShownByTimerRef = useRef(false); // Track if showQuestionNow was called by timer

  const clearTimers = useCallback((shouldNotify = true) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    targetTimestampRef.current = null;

    if (shouldNotify && typeof onTimerCleared === 'function') {
      onTimerCleared(currentQuestionIndex);
    }
  }, [currentQuestionIndex, onTimerCleared]);

  const showQuestionNow = useCallback(() => {
    console.log('[TimeQuestionTrigger] showQuestionNow called for question', currentQuestionIndex);
    clearTimers(false);
    questionShownByTimerRef.current = true; // Mark that timer triggered this
    setShouldShowQuestion(true);
    setTimeRemainingMs(0);
    saveVisibleIndex(storageKeyPrefix, currentQuestionIndex);
  }, [clearTimers, currentQuestionIndex, storageKeyPrefix]);

  const resetForNextQuestion = useCallback(() => {
    console.log('[TimeQuestionTrigger] resetForNextQuestion called - setting shouldShowQuestion=false');
    clearTimers();
    questionShownByTimerRef.current = false; // Reset flag
    setShouldShowQuestion(false);
    setTimeRemainingMs(intervalMs);
    clearVisibleIndex(storageKeyPrefix);
  }, [clearTimers, intervalMs, storageKeyPrefix]);

  const armNextQuestion = useCallback(() => {
    console.log('[TimeQuestionTrigger] 🔵 armNextQuestion called for index:', currentQuestionIndex, 'isEnabled:', isEnabled);
    
    if (!isEnabled || isPaused) {
      console.log('[TimeQuestionTrigger] Not enabled, returning');
      return;
    }
    if (currentQuestionIndex >= totalQuestions) {
      console.log('[TimeQuestionTrigger] All questions done, showing question now');
      showQuestionNow();
      clearTimerState(storageKeyPrefix, currentQuestionIndex);
      return;
    }

    clearTimers();
    
    // Rensa ALLA gamla timers för tidigare frågor (kan finnas kvar efter reload)
    for (let i = 0; i < currentQuestionIndex; i++) {
      clearTimerState(i);
    }
    console.log('[TimeQuestionTrigger] Cleared old timers for questions 0 to', currentQuestionIndex - 1);
    
    // Kolla om vi har en sparad timer för denna fråga
    const savedTarget = loadTimerState(storageKeyPrefix, currentQuestionIndex);
    let target;
    
    if (savedTarget && savedTarget <= Date.now()) {
      console.log('[TimeQuestionTrigger] Saved timer already expired for question', currentQuestionIndex);
      showQuestionNow();
      clearTimerState(storageKeyPrefix, currentQuestionIndex);
      return;
    }

    if (savedTarget && savedTarget > Date.now()) {
      // Återställ från sparad timer
      target = savedTarget;
      console.log('[TimeQuestionTrigger] Restored timer for question', currentQuestionIndex, 'remaining:', target - Date.now(), 'ms');
    } else {
      // Skapa ny timer
      target = Date.now() + intervalMs;
      saveTimerState(storageKeyPrefix, currentQuestionIndex, target);
      console.log('[TimeQuestionTrigger] Created new timer for question', currentQuestionIndex, 'intervalMs:', intervalMs);
    }
    
    targetTimestampRef.current = target;
    const remainingMs = Math.max(0, target - Date.now());
    console.log('[TimeQuestionTrigger] Setting shouldShowQuestion=false, remainingMs:', remainingMs);
    setShouldShowQuestion(false);
    setTimeRemainingMs(remainingMs);

    if (typeof onTimerScheduled === 'function') {
      onTimerScheduled(target, currentQuestionIndex);
    }

    console.log('[TimeQuestionTrigger] Starting setTimeout for', remainingMs, 'ms');
    timeoutRef.current = setTimeout(() => {
      console.log('[TimeQuestionTrigger] ⏰ setTimeout fired for question', currentQuestionIndex);
      showQuestionNow();
      clearTimerState(storageKeyPrefix, currentQuestionIndex);
    }, remainingMs);

    tickerRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, target - now);
      setTimeRemainingMs(remaining);
      if (remaining === 0) {
        console.log('[TimeQuestionTrigger] ⏰ Ticker reached 0 for question', currentQuestionIndex);
        showQuestionNow();
        clearTimerState(storageKeyPrefix, currentQuestionIndex);
      }
    }, 1000);
  }, [clearTimers, currentQuestionIndex, intervalMs, isEnabled, isPaused, onTimerScheduled, showQuestionNow, storageKeyPrefix, totalQuestions]);

  useEffect(() => {
    if (!isEnabled) {
      clearTimers();
      setShouldShowQuestion(true);
      setTimeRemainingMs(0);
      clearVisibleIndex(storageKeyPrefix);
      return;
    }

    if (isPaused) {
      clearTimers(false);
      return;
    }

    if (loadVisibleIndex(storageKeyPrefix) === currentQuestionIndex) {
      setShouldShowQuestion(true);
      setTimeRemainingMs(0);
      clearTimers(false);
      return;
    }

    if (!targetTimestampRef.current && !shouldShowQuestion) {
      armNextQuestion();
    }
  }, [armNextQuestion, clearTimers, currentQuestionIndex, isEnabled, isPaused, shouldShowQuestion, storageKeyPrefix]);

  useEffect(() => {
    if (!isEnabled) return;
    const visibleIndex = loadVisibleIndex(storageKeyPrefix);
    if (visibleIndex === currentQuestionIndex) {
      setShouldShowQuestion(true);
      setTimeRemainingMs(0);
      return;
    }
    if (!shouldShowQuestion && !targetTimestampRef.current) {
      armNextQuestion();
    }
  }, [armNextQuestion, currentQuestionIndex, isEnabled, shouldShowQuestion, storageKeyPrefix]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    shouldShowQuestion,
    timeRemainingMs,
    armNextQuestion,
    cancel: clearTimers,
    showQuestionNow,
    resetForNextQuestion,
    hasActiveTimer: targetTimestampRef.current !== null,
    wasTriggeredByTimer: questionShownByTimerRef.current
  };
};

export default useTimeQuestionTrigger;
