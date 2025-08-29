import { useState, useEffect } from 'react';

const useGeolocation = () => {
    const [position, setPosition] = useState(null);
    const [error, setError] = useState(null);
    const [status, setStatus] = useState('pending'); // 'pending', 'granted', 'denied'

    useEffect(() => {
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

        // Rensa gamla watchers för att undvika minnesläckor
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