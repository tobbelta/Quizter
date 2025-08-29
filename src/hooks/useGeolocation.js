import { useState, useEffect } from 'react';

const useGeolocation = () => {
    const [position, setPosition] = useState(null);
    const [error, setError] = useState(null);
    const [status, setStatus] = useState('pending'); // 'pending', 'granted', 'denied'

    useEffect(() => {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        // Om appen körs på localhost, använd en simulerad position för enkel testning.
        if (isLocalhost) {
            console.warn("KÖR PÅ LOCALHOST: Simulerar GPS-position (Stockholms Centralstation).");
            setTimeout(() => { // Liten fördröjning för att efterlikna verklig laddning
                setPosition({
                    latitude: 59.3308,
                    longitude: 18.0576,
                    accuracy: 10,
                });
                setStatus('granted');
            }, 500);
            return; // Avsluta hooken här för localhost
        }

        // Standardlogik för riktiga enheter
        if (!navigator.geolocation) {
            setError('Geolocation stöds inte av din webbläsare.');
            setStatus('denied');
            return;
        }

        const onSuccess = (pos) => {
            setPosition(pos.coords);
            setError(null);
            setStatus('granted');
        };

        const onError = (err) => {
            setError(err.message);
            setStatus('denied');
        };

        let watcherId;
        navigator.geolocation.getCurrentPosition(onSuccess, onError, {
            enableHighAccuracy: true,
        });
        watcherId = navigator.geolocation.watchPosition(onSuccess, onError, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
        });

        return () => {
            if (watcherId) {
                navigator.geolocation.clearWatch(watcherId);
            }
        };
    }, []);

    return { position, error, status };
};

export default useGeolocation;

