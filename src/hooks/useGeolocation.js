// src/hooks/useGeolocation.js
import { useState, useEffect, useMemo } from 'react';

const useGeolocation = (options) => {
    const [position, setPosition] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fallbackPosition = useMemo(() => ({ lat: 56.6634, lng: 16.3571 }), []);

    useEffect(() => {
        let watchId;

        const success = (pos) => {
            const { latitude, longitude } = pos.coords;
            setPosition({ lat: latitude, lng: longitude });
            setLoading(false);
            setError(null);
        };

        const errorFunc = (err) => {
            setError(`Geolocation Error: ${err.message}`);
            setPosition(fallbackPosition);
            setLoading(false);
        };
        
        if (!navigator.geolocation) {
            setError('Geolocation stöds inte av din webbläsare.');
            setPosition(fallbackPosition);
            setLoading(false);
        } else {
            watchId = navigator.geolocation.watchPosition(success, errorFunc, options);
        }

        return () => {
            if (watchId) {
                navigator.geolocation.clearWatch(watchId);
            }
        };
    // FIX: Lade till 'fallbackPosition' i dependency array.
    }, [options, fallbackPosition]);

    return { position, loading, error };
};

export default useGeolocation;
