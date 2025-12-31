/**
 * Hook för GPS-spårning i distans-baserade rundor.
 * Spårar spelarens faktiska rutt och triggar frågor baserat på tillryggalagd distans.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { calculateDistanceMeters } from '../utils/geo';

/**
 * Spårar GPS-position och beräknar när nästa fråga ska triggas.
 * 
 * @param {Object} options
 * @param {Object} options.coords - Nuvarande GPS-koordinater {lat, lng, accuracy}
 * @param {boolean} options.trackingEnabled - Om GPS-tracking är aktivt
 * @param {number} options.distanceBetweenQuestions - Meter mellan varje fråga
 * @param {number} options.currentQuestionIndex - Index för nuvarande fråga (0-baserat)
 * @param {number} options.totalQuestions - Totalt antal frågor
 * @returns {Object} Tracking-state
 */
export const useDistanceTracking = ({
  coords,
  trackingEnabled,
  distanceBetweenQuestions,
  currentQuestionIndex,
  totalQuestions,
  storageKeyPrefix = ''
}) => {
  const [gpsTrail, setGpsTrail] = useState([]); // Array av GPS-punkter [{lat, lng, timestamp}]
  const [totalDistance, setTotalDistance] = useState(0); // Total distans gången (meter)
  const [distanceToNextQuestion, setDistanceToNextQuestion] = useState(distanceBetweenQuestions);
  const [shouldShowQuestion, setShouldShowQuestion] = useState(false);
  
  const lastPositionRef = useRef(null);
  const questionDistanceRef = useRef(0); // Distans sedan senaste fråga
  const totalDistanceRef = useRef(0);

  const buildStorageKey = useCallback(() => {
    if (!storageKeyPrefix) return '';
    return `${storageKeyPrefix}:distance`;
  }, [storageKeyPrefix]);

  const loadStoredState = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const key = buildStorageKey();
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('[DistanceTracking] Could not parse stored state', error);
      return null;
    }
  }, [buildStorageKey]);

  const saveStoredState = useCallback((nextState) => {
    if (typeof window === 'undefined') return;
    const key = buildStorageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(nextState));
    } catch (error) {
      console.warn('[DistanceTracking] Could not save state', error);
    }
  }, [buildStorageKey]);

  useEffect(() => {
    totalDistanceRef.current = totalDistance;
  }, [totalDistance]);

  // Återställ eller återställ state när en ny fråga besvaras
  useEffect(() => {
    const stored = loadStoredState();
    const storedIndex = Number.isFinite(stored?.questionIndex) ? stored.questionIndex : null;
    if (stored && storedIndex === currentQuestionIndex) {
      const storedQuestionDistance = Number(stored.questionDistance || 0);
      const storedTotalDistance = Number(stored.totalDistance || 0);
      questionDistanceRef.current = storedQuestionDistance;
      totalDistanceRef.current = storedTotalDistance;
      setTotalDistance(storedTotalDistance);
      if (stored?.lastPosition) {
        lastPositionRef.current = stored.lastPosition;
        setGpsTrail([stored.lastPosition]);
      }
      setDistanceToNextQuestion(Math.max(0, distanceBetweenQuestions - storedQuestionDistance));
      setShouldShowQuestion(currentQuestionIndex === 0 ? true : storedQuestionDistance >= distanceBetweenQuestions);
      return;
    }

    questionDistanceRef.current = 0;
    setDistanceToNextQuestion(distanceBetweenQuestions);
    setShouldShowQuestion(currentQuestionIndex === 0); // Visa första frågan direkt
    saveStoredState({
      questionIndex: currentQuestionIndex,
      questionDistance: 0,
      totalDistance: totalDistanceRef.current,
      lastPosition: lastPositionRef.current,
      updatedAt: Date.now()
    });
  }, [currentQuestionIndex, distanceBetweenQuestions, loadStoredState, saveStoredState]);

  useEffect(() => {
    if (!trackingEnabled) return;
    const stored = loadStoredState();
    const storedIndex = Number.isFinite(stored?.questionIndex) ? stored.questionIndex : null;
    if (stored && storedIndex === currentQuestionIndex) {
      const storedQuestionDistance = Number(stored.questionDistance || 0);
      const storedTotalDistance = Number(stored.totalDistance || 0);
      questionDistanceRef.current = storedQuestionDistance;
      totalDistanceRef.current = storedTotalDistance;
      setTotalDistance(storedTotalDistance);
      if (stored?.lastPosition) {
        lastPositionRef.current = stored.lastPosition;
        setGpsTrail([stored.lastPosition]);
      }
      setDistanceToNextQuestion(Math.max(0, distanceBetweenQuestions - storedQuestionDistance));
    }
  }, [trackingEnabled, currentQuestionIndex, distanceBetweenQuestions, loadStoredState]);

  // Spåra GPS-position och uppdatera distans
  useEffect(() => {
    if (!coords || !trackingEnabled) {
      return;
    }

    const currentPosition = {
      lat: coords.lat,
      lng: coords.lng,
      timestamp: Date.now()
    };

    // Första positionen - bara spara
    if (!lastPositionRef.current) {
      lastPositionRef.current = currentPosition;
      setGpsTrail([currentPosition]);
      return;
    }

    // Beräkna distans från senaste position
    const distanceFromLast = calculateDistanceMeters(
      lastPositionRef.current,
      currentPosition
    );

    // Filter bort outliers (accuracy check + max reasonable movement)
    const isReasonableMovement = distanceFromLast < 100; // Max 100m mellan uppdateringar
    const hasGoodAccuracy = coords.accuracy ? coords.accuracy < 50 : true;

    if (!isReasonableMovement || !hasGoodAccuracy) {
      console.warn('[DistanceTracking] Filtrerar bort outlier position:', {
        distance: distanceFromLast,
        accuracy: coords.accuracy
      });
      return;
    }

    // Uppdatera state
    setGpsTrail(prev => [...prev, currentPosition]);
    const nextTotalDistance = totalDistanceRef.current + distanceFromLast;
    totalDistanceRef.current = nextTotalDistance;
    setTotalDistance(nextTotalDistance);
    
    // Uppdatera distans sedan senaste fråga
    questionDistanceRef.current += distanceFromLast;
    
    const remainingDistance = distanceBetweenQuestions - questionDistanceRef.current;
    setDistanceToNextQuestion(Math.max(0, remainingDistance));

    console.log('[DistanceTracking] Position update:', {
      moved: Math.round(distanceFromLast) + 'm',
      questionDistance: Math.round(questionDistanceRef.current) + 'm',
      required: distanceBetweenQuestions + 'm',
      remaining: Math.round(remainingDistance) + 'm'
    });

    // Trigga nästa fråga om vi gått tillräckligt långt
    if (questionDistanceRef.current >= distanceBetweenQuestions) {
      console.log('🎯 [DistanceTracking] TRIGGERING QUESTION!', {
        questionDistance: questionDistanceRef.current,
        required: distanceBetweenQuestions,
        currentIndex: currentQuestionIndex
      });
      setShouldShowQuestion(true);
    }

    lastPositionRef.current = currentPosition;
    saveStoredState({
      questionIndex: currentQuestionIndex,
      questionDistance: questionDistanceRef.current,
      totalDistance: nextTotalDistance,
      lastPosition: currentPosition,
      updatedAt: Date.now()
    });
  }, [coords, trackingEnabled, distanceBetweenQuestions, currentQuestionIndex, saveStoredState]);

  // Reset när fråga besvaras
  const resetQuestionDistance = useCallback(() => {
    questionDistanceRef.current = 0;
    setDistanceToNextQuestion(distanceBetweenQuestions);
    setShouldShowQuestion(false);
    saveStoredState({
      questionIndex: currentQuestionIndex,
      questionDistance: 0,
      totalDistance: totalDistanceRef.current,
      lastPosition: lastPositionRef.current,
      updatedAt: Date.now()
    });
  }, [currentQuestionIndex, distanceBetweenQuestions, saveStoredState]);

  return {
    gpsTrail,
    totalDistance,
    distanceToNextQuestion,
    shouldShowQuestion,
    resetQuestionDistance
  };
};

export default useDistanceTracking;
