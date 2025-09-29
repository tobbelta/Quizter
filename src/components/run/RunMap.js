/**
 * Visar rundans checkpoints på en Leaflet-karta och följer spelaren.
 */
import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { DEFAULT_CENTER } from '../../utils/constants';

/**
 * Håller kartvyn centrerad på den aktiva positionen utan att skapa loops.
 */
const MapUpdater = ({ center }) => {
  const map = useMap();

  useEffect(() => {
    if (!center) return;
    const current = map.getCenter();
    const deltaLat = Math.abs(current.lat - center[0]);
    const deltaLng = Math.abs(current.lng - center[1]);
    if (deltaLat < 0.0001 && deltaLng < 0.0001) {
      return;
    }
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);

  return null;
};

/**
 * Renderar hela kartkomponenten inklusive polyline, checkpoints och spelarmarkör.
 */
const RunMap = ({ checkpoints, userPosition, activeOrder, answeredCount, route }) => {
  const positions = useMemo(() => checkpoints.map((checkpoint) => [checkpoint.location.lat, checkpoint.location.lng]), [checkpoints]);

  // EXTRA DEBUG LOGGING
  console.log('=== RunMap DEBUG ===');
  console.log('Props mottagna:', {
    checkpoints: checkpoints?.length || 0,
    userPosition,
    activeOrder,
    answeredCount,
    route: route,
    routeType: typeof route,
    routeIsArray: Array.isArray(route),
    routeLength: route?.length
  });
  console.log('Route innehåll (första 3 punkter):', route?.slice(0, 3));
  console.log('==================');

  // Använd faktisk rutt om tillgänglig, annars fallback till raka linjer mellan checkpoints
  const routePositions = useMemo(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[RunMap] Route data:', {
        route: route,
        routeLength: route?.length || 0,
        routeType: typeof route,
        isArray: Array.isArray(route),
        checkpointCount: positions.length,
        routeFirstPoint: route?.[0],
        routeLastPoint: route?.[route?.length - 1]
      });
    }

    // Kontrollera om vi har en giltig rutt med faktiska koordinater
    if (route && Array.isArray(route) && route.length > 1) {
      // Validera att rutdatan har korrekt format
      const isValidRoute = route.every(point =>
        point &&
        typeof point.lat === 'number' &&
        typeof point.lng === 'number' &&
        !isNaN(point.lat) &&
        !isNaN(point.lng)
      );

      if (isValidRoute) {
        const mapped = route.map(point => [point.lat, point.lng]);
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[RunMap] Använder detaljerad rutt med', mapped.length, 'punkter');
          console.debug('[RunMap] Första punkten:', mapped[0]);
          console.debug('[RunMap] Sista punkten:', mapped[mapped.length - 1]);
        }
        return mapped;
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[RunMap] Rutt har ogiltigt format, faller tillbaka till checkpoints');
        }
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[RunMap] Fallback till checkpoint-linjer med', positions.length, 'punkter');
    }
    return positions;
  }, [route, positions]);

  const center = useMemo(() => {
    if (userPosition) return [userPosition.lat, userPosition.lng];
    if (positions.length > 0) return positions[0];
    return DEFAULT_CENTER;
  }, [userPosition, positions]);

  return (
    <div className="h-80 w-full overflow-hidden rounded-lg border border-slate-700 shadow-lg">
      <MapContainer center={center} zoom={16} className="h-full w-full" scrollWheelZoom>
        <MapUpdater center={center} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {routePositions.length > 1 && (
          <>
            {/* Bakgrundsstreck för bättre synlighet */}
            <Polyline
              positions={routePositions}
              pathOptions={{
                color: '#000000',
                weight: 8,
                opacity: 0.8
              }}
            />
            {/* Huvudrutt i stark cyan */}
            <Polyline
              positions={routePositions}
              pathOptions={{
                color: '#06b6d4',
                weight: 6,
                opacity: 1.0,
                lineCap: 'round',
                lineJoin: 'round'
              }}
            />
          </>
        )}
        {positions.map((position, index) => {
          const isCompleted = index < answeredCount;
          const isActive = index === activeOrder;
          const color = isCompleted ? '#10b981' : isActive ? '#f59e0b' : '#6366f1';
          const radius = isActive ? 14 : 10;
          const key = checkpoints[index].questionId || checkpoints[index].order || index;
          return (
            <CircleMarker
              key={key}
              center={position}
              radius={radius}
              pathOptions={{
                color: '#ffffff',
                fillColor: color,
                fillOpacity: 0.9,
                weight: 3,
                opacity: 1.0
              }}
            />
          );
        })}
        {userPosition && (
          <CircleMarker
            center={[userPosition.lat, userPosition.lng]}
            radius={10}
            pathOptions={{
              color: '#ffffff',
              fillColor: '#ef4444',
              fillOpacity: 1.0,
              weight: 3
            }}
          />
        )}
      </MapContainer>
    </div>
  );
};

export default RunMap;
