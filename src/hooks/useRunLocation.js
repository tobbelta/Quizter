/**
 * Hook som kapslar GPS-hantering och låter spelaren slå på/av spårning.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FALLBACK_POSITION } from '../utils/constants';

const STORAGE_KEY = 'tipspromenad:trackingEnabled';

/** Säkerställer att vi startar med samma GPS-inställning som senast. */
const readInitialPreference = () => {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'off') return false;
    if (stored === 'on') return true;
    return true;
  } catch (error) {
    console.warn('Kunde inte läsa tracking-preferens', error);
    return true;
  }
};

/** Huvudhooken som håller reda på koordinater och status. */
const useRunLocation = () => {
  const [trackingEnabled, setTrackingEnabled] = useState(() => readInitialPreference());
  const [status, setStatus] = useState('idle');
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const watchIdRef = useRef(null);

  /** Stoppar pågående geolocation-watch. */
  const clearWatcher = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, trackingEnabled ? 'on' : 'off');
    } catch (storageError) {
      console.warn('Kunde inte spara tracking-preferens', storageError);
    }
  }, [trackingEnabled]);

  useEffect(() => {
    if (!trackingEnabled) {
      clearWatcher();
      setStatus((prev) => (prev === 'unsupported' ? 'unsupported' : 'idle'));
      return undefined;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      setTrackingEnabled(false);
      return undefined;
    }

    setStatus('pending');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setStatus('active');
        setError(null);
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        setLastUpdated(new Date(position.timestamp || Date.now()));
      },
      (geoError) => {
        console.warn('Geolocation misslyckades', geoError);
        setError(geoError);
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setStatus('denied');
          setTrackingEnabled(false);
        } else if (geoError.code === geoError.POSITION_UNAVAILABLE) {
          setStatus('unavailable');
        } else if (geoError.code === geoError.TIMEOUT) {
          setStatus('timeout');
        } else {
          setStatus('error');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 20000
      }
    );

    return clearWatcher;
  }, [trackingEnabled, clearWatcher]);

  /** Slår på GPS-spårning och sätter flaggan. */
  const enableTracking = useCallback(() => {
    setTrackingEnabled(true);
  }, []);

  /** Slår av GPS-spårning och stannar watchern. */
  const disableTracking = useCallback(() => {
    setTrackingEnabled(false);
  }, []);

  /** Returnerar antingen den riktiga GPS-positionen eller fallback-positionen. */
  const getCurrentPosition = useCallback(() => {
    if (coords && status === 'active') {
      return coords;
    }
    return FALLBACK_POSITION;
  }, [coords, status]);

  return {
    trackingEnabled,
    status,
    coords,
    error,
    lastUpdated,
    enableTracking,
    disableTracking,
    getCurrentPosition
  };
};

export default useRunLocation;
