/**
 * Hook som hanterar tidsstyrd frisläppning av frågor.
 * 
 * SYFTE: Används för tidsbaserade rundor där frågor släpps efter ett visst intervall (t.ex. var 5:e minut)
 * istället för att baseras på GPS-position eller distans. Hooken håller reda på nedräkningen,
 * meddelar när nästa fråga ska visas och sparar tillstånd i sessionStorage för att överleva page reloads.
 * 
 * ANVÄNDNING: Aktiveras i PlayRunPage när run.mode === 'time'
 * 
 * VIKTIGA FUNKTIONER:
 * - armNextQuestion(): Startar timer för nästa fråga
 * - showQuestionNow(): Visar frågan omedelbart (kan anropas manuellt)
 * - resetForNextQuestion(): Återställer för nästa fråga efter svar
 * - wasTriggeredByTimer: Flagga för att undvika race conditions med notifieringar
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// KONSTANTER
const MS_PER_MINUTE = 60 * 1000;

/**
 * Begränsar intervallet till mellan 1-180 minuter för att undvika orimliga värden
 * SYFTE: Säkerställer att intervallet är giltigt och rimligt
 */
const clampInterval = (minutes) => {
  if (!Number.isFinite(minutes)) return 1;
  return Math.max(1, Math.min(minutes, 180));
};

// ============================================================================
// SESSIONSTORAGE HELPERS
// SYFTE: Spara timer-state mellan page reloads så att nedräkning fortsätter korrekt
// ============================================================================

/** Genererar unik nyckel för varje frågas timer i sessionStorage */
const getStorageKey = (index) => `timeQuestionTrigger_q${index}`;

/** Sparar target timestamp för när nästa fråga ska visas */
const saveTimerState = (questionIndex, targetTimestamp) => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(getStorageKey(questionIndex), targetTimestamp.toString());
  } catch (e) {
    console.warn('[TimeQuestionTrigger] Could not save timer state', e);
  }
};

/** Laddar sparad target timestamp för en specifik fråga */
const loadTimerState = (questionIndex) => {
  if (typeof window === 'undefined') return null;
  try {
    const saved = sessionStorage.getItem(getStorageKey(questionIndex));
    return saved ? parseInt(saved, 10) : null;
  } catch (e) {
    return null;
  }
};

/** Rensar sparad timer state för en fråga (kallas när frågan besvarats) */
const clearTimerState = (questionIndex) => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(getStorageKey(questionIndex));
  } catch (e) {
    // Ignore - inte kritiskt om det misslyckas
  }
};

// ============================================================================
// HUVUDHOOK
// ============================================================================

/**
 * useTimeQuestionTrigger
 * 
 * @param {boolean} isEnabled - Om tidsbaserad triggering är aktiverad (från run.mode === 'time')
 * @param {number} intervalMinutes - Antal minuter mellan varje fråga (från run.minutesBetweenQuestions)
 * @param {number} currentQuestionIndex - Index för nuvarande fråga (0-based)
 * @param {number} totalQuestions - Totalt antal frågor i rundan
 * @param {function} onTimerScheduled - Callback när timer schemaläggs (för notifieringar)
 * @param {function} onTimerCleared - Callback när timer rensas
 * 
 * @returns {object} {
 *   shouldShowQuestion: boolean - Om frågan ska visas nu
 *   timeRemainingMs: number - Millisekunder kvar till nästa fråga
 *   armNextQuestion: function - Startar timer för nästa fråga
 *   cancel: function - Avbryter alla timers
 *   showQuestionNow: function - Visar frågan omedelbart
 *   resetForNextQuestion: function - Återställer för nästa fråga
 *   hasActiveTimer: boolean - Om en timer är aktiv
 *   wasTriggeredByTimer: boolean - Om frågan visades pga timer (inte manuellt)
 * }
 */
const useTimeQuestionTrigger = ({
  isEnabled,
  intervalMinutes,
  currentQuestionIndex,
  totalQuestions,
  onTimerScheduled,
  onTimerCleared
}) => {
  // Säkerställ att intervallet är giltigt
  const safeMinutes = clampInterval(intervalMinutes);
  const intervalMs = useMemo(() => safeMinutes * MS_PER_MINUTE, [safeMinutes]);

  // STATE
  // shouldShowQuestion: Om frågan är klar att visas (false = väntar på timer)
  const [shouldShowQuestion, setShouldShowQuestion] = useState(() => !isEnabled);
  
  // timeRemainingMs: Millisekunder kvar till frågan ska visas (för UI countdown)
  const [timeRemainingMs, setTimeRemainingMs] = useState(() => {
    if (!isEnabled) return 0;
    
    // Försök ladda sparad timer från sessionStorage
    const savedTarget = loadTimerState(currentQuestionIndex);
    if (savedTarget) {
      const remaining = Math.max(0, savedTarget - Date.now());
      return remaining;
    }
    return intervalMs;
  });

  // REFS (för att hålla värden mellan renders utan att trigga re-render)
  const targetTimestampRef = useRef(null); // Target timestamp när frågan ska visas
  const timeoutRef = useRef(null); // setTimeout ID för att visa frågan
  const tickerRef = useRef(null); // setInterval ID för countdown UI
  
  // VIKTIGT: Flagga för att undvika race condition med notifieringar
  // När timer visar frågan sätts denna till true så vi vet att det var timern
  // och inte användaren som triggade visningen (används i PlayRunPage)
  const questionShownByTimerRef = useRef(false);

  // ============================================================================
  // CLEANUP FUNCTION
  // SYFTE: Rensar alla timers och intervaller när de inte längre behövs
  // ============================================================================
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

    // Notifiera parent component om timern rensades (för att rensa notifieringar)
    if (shouldNotify && typeof onTimerCleared === 'function') {
      onTimerCleared(currentQuestionIndex);
    }
  }, [currentQuestionIndex, onTimerCleared]);

  // ============================================================================
  // SHOW QUESTION NOW
  // SYFTE: Visar frågan omedelbart (kallas när timer går ut eller manuellt)
  // ============================================================================
  const showQuestionNow = useCallback(() => {
    console.log('[TimeQuestionTrigger] showQuestionNow called for question', currentQuestionIndex);
    clearTimers(false);
    questionShownByTimerRef.current = true; // Markera att timer triggade detta (inte användaren)
    setShouldShowQuestion(true);
    setTimeRemainingMs(0);
  }, [clearTimers, currentQuestionIndex]);

  // ============================================================================
  // RESET FOR NEXT QUESTION
  // SYFTE: Återställer state efter att en fråga besvarats, redo för nästa
  // ============================================================================
  const resetForNextQuestion = useCallback(() => {
    console.log('[TimeQuestionTrigger] resetForNextQuestion called - setting shouldShowQuestion=false');
    clearTimers();
    questionShownByTimerRef.current = false; // Återställ flagga för nästa fråga
    setShouldShowQuestion(false);
    setTimeRemainingMs(intervalMs);
  }, [clearTimers, intervalMs]);

  // ============================================================================
  // ARM NEXT QUESTION
  // SYFTE: Startar timer för nästa fråga - kärnan i hela hooken
  // KALLAS: Efter att användaren besvarat en fråga (från PlayRunPage)
  // ============================================================================
  const armNextQuestion = useCallback(() => {
    console.log('[TimeQuestionTrigger] 🔵 armNextQuestion called for index:', currentQuestionIndex, 'isEnabled:', isEnabled);
    
    // Guard: Om inte enabled, returnera direkt
    if (!isEnabled) {
      console.log('[TimeQuestionTrigger] Not enabled, returning');
      return;
    }
    
    // Guard: Om alla frågor besvarats, visa sista frågan direkt
    if (currentQuestionIndex >= totalQuestions) {
      console.log('[TimeQuestionTrigger] All questions done, showing question now');
      showQuestionNow();
      clearTimerState(currentQuestionIndex);
      return;
    }

    // Rensa alla gamla timers
    clearTimers();
    
    // VIKTIGT: Rensa sessionStorage för ALLA tidigare frågor
    // Detta förhindrar att gamla timers blir kvar efter reload
    for (let i = 0; i < currentQuestionIndex; i++) {
      clearTimerState(i);
    }
    console.log('[TimeQuestionTrigger] Cleared old timers for questions 0 to', currentQuestionIndex - 1);
    
    // Försök återställa från sessionStorage (om page reload)
    const savedTarget = loadTimerState(currentQuestionIndex);
    let target;
    
    if (savedTarget && savedTarget > Date.now()) {
      // Vi har en sparad timer som fortfarande är giltig - återställ den
      target = savedTarget;
      console.log('[TimeQuestionTrigger] Restored timer for question', currentQuestionIndex, 'remaining:', target - Date.now(), 'ms');
    } else {
      // Ingen sparad timer eller den har gått ut - skapa ny
      target = Date.now() + intervalMs;
      saveTimerState(currentQuestionIndex, target);
      console.log('[TimeQuestionTrigger] Created new timer for question', currentQuestionIndex, 'intervalMs:', intervalMs);
    }
    
    // Sätt target och uppdatera UI
    targetTimestampRef.current = target;
    const remainingMs = Math.max(0, target - Date.now());
    console.log('[TimeQuestionTrigger] Setting shouldShowQuestion=false, remainingMs:', remainingMs);
    setShouldShowQuestion(false);
    setTimeRemainingMs(remainingMs);

    // Notifiera parent om timer schemalagd (för att schemalägga native notification)
    if (typeof onTimerScheduled === 'function') {
      onTimerScheduled(target, currentQuestionIndex);
    }

    // Starta setTimeout för att visa frågan när tiden är ute
    console.log('[TimeQuestionTrigger] Starting setTimeout for', remainingMs, 'ms');
    timeoutRef.current = setTimeout(() => {
      console.log('[TimeQuestionTrigger] ⏰ setTimeout fired for question', currentQuestionIndex);
      showQuestionNow();
      clearTimerState(currentQuestionIndex);
    }, remainingMs);

    // Starta setInterval för att uppdatera countdown i UI varje sekund
    tickerRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, target - now);
      setTimeRemainingMs(remaining);
      
      // Om tiden är ute, visa frågan (backup till setTimeout)
      if (remaining === 0) {
        console.log('[TimeQuestionTrigger] ⏰ Ticker reached 0 for question', currentQuestionIndex);
        showQuestionNow();
        clearTimerState(currentQuestionIndex);
      }
    }, 1000);
  }, [clearTimers, currentQuestionIndex, intervalMs, isEnabled, onTimerScheduled, showQuestionNow, totalQuestions]);

  // ============================================================================
  // EFFECTS
  // ============================================================================
  
  // Effect: Hantera disabled state och auto-start för första frågan
  useEffect(() => {
    // Om tidsbaserad triggering inte är enabled, visa frågan direkt
    if (!isEnabled) {
      clearTimers();
      setShouldShowQuestion(true);
      setTimeRemainingMs(0);
      return;
    }

    // Auto-start timer för första frågan (index 0) om ingen timer är aktiv
    if (!targetTimestampRef.current && currentQuestionIndex === 0) {
      armNextQuestion();
    }
  }, [armNextQuestion, clearTimers, currentQuestionIndex, isEnabled]);

  // Effect: Cleanup vid unmount - rensa alla timers
  useEffect(() => clearTimers, [clearTimers]);

  // ============================================================================
  // RETURN
  // ============================================================================
  return {
    shouldShowQuestion,        // true = frågan ska visas, false = väntar på timer
    timeRemainingMs,           // Millisekunder kvar för countdown UI
    armNextQuestion,           // Starta timer för nästa fråga
    cancel: clearTimers,       // Avbryt alla timers (används vid unmount)
    showQuestionNow,           // Visa frågan omedelbart (kan användas för "skip waiting")
    resetForNextQuestion,      // Återställ efter att fråga besvarats
    hasActiveTimer: targetTimestampRef.current !== null, // true om timer är aktiv
    wasTriggeredByTimer: questionShownByTimerRef.current // true om timer triggade visningen (inte användaren)
  };
};

export default useTimeQuestionTrigger;
