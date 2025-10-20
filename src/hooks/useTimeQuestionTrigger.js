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
const getStorageKey = (index) => `timeQuestionTrigger_q${index}`;

const saveTimerState = (questionIndex, targetTimestamp) => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(getStorageKey(questionIndex), targetTimestamp.toString());
  } catch (e) {
    console.warn('[TimeQuestionTrigger] Could not save timer state', e);
  }
};

const loadTimerState = (questionIndex) => {
  if (typeof window === 'undefined') return null;
  try {
    const saved = sessionStorage.getItem(getStorageKey(questionIndex));
    return saved ? parseInt(saved, 10) : null;
  } catch (e) {
    return null;
  }
};

const clearTimerState = (questionIndex) => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(getStorageKey(questionIndex));
  } catch (e) {
    // Ignore
  }
};

const useTimeQuestionTrigger = ({
  isEnabled,
  intervalMinutes,
  currentQuestionIndex,
  totalQuestions
}) => {
  const safeMinutes = clampInterval(intervalMinutes);
  const intervalMs = useMemo(() => safeMinutes * MS_PER_MINUTE, [safeMinutes]);

  const [shouldShowQuestion, setShouldShowQuestion] = useState(() => !isEnabled);
  const [timeRemainingMs, setTimeRemainingMs] = useState(() => {
    if (!isEnabled) return 0;
    
    // Försök ladda sparad timer
    const savedTarget = loadTimerState(currentQuestionIndex);
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

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    targetTimestampRef.current = null;
  }, []);

  const showQuestionNow = useCallback(() => {
    console.log('[TimeQuestionTrigger] showQuestionNow called for question', currentQuestionIndex);
    clearTimers();
    questionShownByTimerRef.current = true; // Mark that timer triggered this
    setShouldShowQuestion(true);
    setTimeRemainingMs(0);
  }, [clearTimers, currentQuestionIndex]);

  const resetForNextQuestion = useCallback(() => {
    console.log('[TimeQuestionTrigger] resetForNextQuestion called - setting shouldShowQuestion=false');
    clearTimers();
    questionShownByTimerRef.current = false; // Reset flag
    setShouldShowQuestion(false);
    setTimeRemainingMs(intervalMs);
  }, [clearTimers, intervalMs]);

  const armNextQuestion = useCallback(() => {
    if (!isEnabled) {
      return;
    }
    if (currentQuestionIndex >= totalQuestions) {
      showQuestionNow();
      clearTimerState(currentQuestionIndex);
      return;
    }

    clearTimers();
    
    // Rensa ALLA gamla timers för tidigare frågor (kan finnas kvar efter reload)
    for (let i = 0; i < currentQuestionIndex; i++) {
      clearTimerState(i);
    }
    
    // Kolla om vi har en sparad timer för denna fråga
    const savedTarget = loadTimerState(currentQuestionIndex);
    let target;
    
    if (savedTarget && savedTarget > Date.now()) {
      // Återställ från sparad timer
      target = savedTarget;
      console.log('[TimeQuestionTrigger] Restored timer for question', currentQuestionIndex, 'remaining:', target - Date.now());
    } else {
      // Skapa ny timer
      target = Date.now() + intervalMs;
      saveTimerState(currentQuestionIndex, target);
      console.log('[TimeQuestionTrigger] Created new timer for question', currentQuestionIndex);
    }
    
    targetTimestampRef.current = target;
    const remainingMs = Math.max(0, target - Date.now());
    console.log('[TimeQuestionTrigger] Setting shouldShowQuestion=false, remainingMs:', remainingMs);
    setShouldShowQuestion(false);
    setTimeRemainingMs(remainingMs);

    timeoutRef.current = setTimeout(() => {
      showQuestionNow();
      clearTimerState(currentQuestionIndex);
    }, remainingMs);

    tickerRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, target - now);
      setTimeRemainingMs(remaining);
      if (remaining === 0) {
        showQuestionNow();
        clearTimerState(currentQuestionIndex);
      }
    }, 1000);
  }, [clearTimers, currentQuestionIndex, intervalMs, isEnabled, showQuestionNow, totalQuestions]);

  useEffect(() => {
    if (!isEnabled) {
      clearTimers();
      setShouldShowQuestion(true);
      setTimeRemainingMs(0);
      return;
    }

    if (!targetTimestampRef.current && currentQuestionIndex === 0) {
      armNextQuestion();
    }
  }, [armNextQuestion, clearTimers, currentQuestionIndex, isEnabled]);

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
