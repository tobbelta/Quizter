/**
 * Hook som kapslar GPS-hantering och låter spelaren slå på/av spårning.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FALLBACK_POSITION } from '../utils/constants';

const STORAGE_KEY = 'tipspromenad:trackingEnabled';

/**
 * Beräknar avståndet mellan två GPS-koordinater i meter (Haversine-formeln)
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Jordens radie i meter
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

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

    // Håll koll på senaste positionen för att undvika onödiga uppdateringar
    let lastPosition = null;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        // Uppdatera bara om positionen har ändrats signifikant (>5 meter)
        if (lastPosition) {
          const distance = calculateDistance(
            lastPosition.coords.latitude,
            lastPosition.coords.longitude,
            position.coords.latitude,
            position.coords.longitude
          );

          // Om förflyttningen är mindre än 5 meter, hoppa över uppdateringen
          if (distance < 5) {
            return;
          }
        }

        lastPosition = position;
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
        maximumAge: 10000, // Acceptera position upp till 10 sekunder gammal
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
