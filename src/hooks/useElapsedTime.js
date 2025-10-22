/**
 * Hook för att spåra förfluten tid sedan start
 */
import { useState, useEffect, useRef } from 'react';

const useElapsedTime = (isActive = true) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isActive) {
      // Starta timer om inte redan startad
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }

      // Uppdatera varje sekund
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTimeRef.current) / 1000);
        setElapsedSeconds(elapsed);
      }, 1000);
    } else {
      // Pausa timer
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive]);

  // Formatera tid som HH:MM:SS
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  const reset = () => {
    startTimeRef.current = Date.now();
    setElapsedSeconds(0);
  };

  return {
    elapsedSeconds,
    formattedTime: formatTime(elapsedSeconds),
    reset
  };
};

export default useElapsedTime;
