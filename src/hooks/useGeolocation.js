import { useState, useEffect } from 'react';

const useGeolocation = () => {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Fallback-position i Kalmar
  const fallbackPosition = {
    latitude: 56.6634, // Nygatan 13a, Kalmar
    longitude: 16.3571,
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setPosition(fallbackPosition);
      return;
    }

    const watcher = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setError(null);
        setPermissionDenied(false);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          console.warn("User denied geolocation access.");
          setPermissionDenied(true);
          setError("User denied access to location.");
          setPosition(fallbackPosition);
        } else {
          console.error("Geolocation error:", err);
          setError(err.message);
          setPosition(fallbackPosition); // Använd fallback även vid andra fel
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );

    // Städa upp watchern när komponenten avmonteras
    return () => navigator.geolocation.clearWatch(watcher);
  }, []); // Tom array säkerställer att effekten bara körs en gång

  return { position, error, permissionDenied };
};

export default useGeolocation;
