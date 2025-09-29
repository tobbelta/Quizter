/**
 * Visar rundans checkpoints på en Leaflet-karta, följer spelaren och visar ruttens riktning.
 */
import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-polylinedecorator'; // Importera för att rita pilar
import L from 'leaflet'; // Behövs för PolylineDecorator
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
 * Ritar pilar längs med en rutt för att visa riktning.
 */
const RouteArrowDecorator = ({ route }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !route || route.length === 0) return;

    // Skapa ett lager med pilar
    const decorator = L.polylineDecorator(route, {
      patterns: [
        {
          offset: 25, // Starta första pilen 25px in på linjen
          repeat: 120, // Upprepa pilarna var 120:e pixel
          symbol: L.Symbol.arrowHead({
            pixelSize: 12,
            pathOptions: {
              color: '#FFFFFF', // Vit färg på pilarna för kontrast
              fillOpacity: 0.9,
              weight: 1,
              stroke: true,
              fill: true
            }
          })
        }
      ]
    });

    decorator.addTo(map);

    // Städa upp lagret när komponenten tas bort eller rutten ändras
    return () => {
      if (map.hasLayer(decorator)) {
        map.removeLayer(decorator);
      }
    };
  }, [map, route]); // Kör om effekten om kartan eller rutten ändras

  return null;
};


/**
 * Renderar hela kartkomponenten inklusive polyline, checkpoints och spelarmarkör.
 */
const RunMap = ({ checkpoints, userPosition, activeOrder, answeredCount, route }) => {
  const positions = useMemo(() => checkpoints.map((checkpoint) => [checkpoint.location.lat, checkpoint.location.lng]), [checkpoints]);

  // Använd faktisk rutt om tillgänglig, annars fallback till raka linjer mellan checkpoints
  const routePositions = useMemo(() => {
    // Kontrollera om vi har en giltig rutt med faktiska koordinater
    if (route && Array.isArray(route) && route.length > 1) {
      const isValidRoute = route.every(point =>
        point &&
        typeof point.lat === 'number' &&
        typeof point.lng === 'number' &&
        !isNaN(point.lat) &&
        !isNaN(point.lng)
      );

      if (isValidRoute) {
        return route.map(point => [point.lat, point.lng]);
      }
    }
    // Fallback
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
            {/* Lägg till riktningspilarna ovanpå rutten */}
            <RouteArrowDecorator route={routePositions} />
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
