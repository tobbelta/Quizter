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
  totalQuestions
}) => {
  const [gpsTrail, setGpsTrail] = useState([]); // Array av GPS-punkter [{lat, lng, timestamp}]
  const [totalDistance, setTotalDistance] = useState(0); // Total distans gången (meter)
  const [distanceToNextQuestion, setDistanceToNextQuestion] = useState(distanceBetweenQuestions);
  const [shouldShowQuestion, setShouldShowQuestion] = useState(false);
  
  const lastPositionRef = useRef(null);
  const questionDistanceRef = useRef(0); // Distans sedan senaste fråga

  // Återställ state när en ny fråga besvaras
  useEffect(() => {
    questionDistanceRef.current = 0;
    setDistanceToNextQuestion(distanceBetweenQuestions);
    setShouldShowQuestion(currentQuestionIndex === 0); // Visa första frågan direkt
  }, [currentQuestionIndex, distanceBetweenQuestions]);

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
    setTotalDistance(prev => prev + distanceFromLast);
    
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
  }, [coords, trackingEnabled, distanceBetweenQuestions, currentQuestionIndex]);

  // Reset när fråga besvaras
  const resetQuestionDistance = useCallback(() => {
    questionDistanceRef.current = 0;
    setDistanceToNextQuestion(distanceBetweenQuestions);
    setShouldShowQuestion(false);
  }, [distanceBetweenQuestions]);

  return {
    gpsTrail,
    totalDistance,
    distanceToNextQuestion,
    shouldShowQuestion,
    resetQuestionDistance
  };
};

export default useDistanceTracking;
