/**
 * Visar rundans checkpoints på en Leaflet-karta och följer spelaren.
 */
import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [56.6616, 16.363];

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
const RunMap = ({ checkpoints, userPosition, activeOrder, answeredCount }) => {
  const positions = useMemo(() => checkpoints.map((checkpoint) => [checkpoint.location.lat, checkpoint.location.lng]), [checkpoints]);

  const center = useMemo(() => {
    if (userPosition) return [userPosition.lat, userPosition.lng];
    if (positions.length > 0) return positions[0];
    return DEFAULT_CENTER;
  }, [userPosition, positions]);

  return (
    <div className="h-72 w-full overflow-hidden rounded-lg border border-slate-700">
      <MapContainer center={center} zoom={15} className="h-full w-full" scrollWheelZoom>
        <MapUpdater center={center} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {positions.length > 1 && (
          <Polyline positions={positions} pathOptions={{ color: '#0891b2', weight: 4, opacity: 0.7 }} />
        )}
        {positions.map((position, index) => {
          const isCompleted = index < answeredCount;
          const isActive = index === activeOrder;
          const color = isCompleted ? '#34d399' : isActive ? '#facc15' : '#94a3b8';
          const radius = isActive ? 11 : 7;
          const key = checkpoints[index].questionId || checkpoints[index].order || index;
          return (
            <CircleMarker
              key={key}
              center={position}
              radius={radius}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: isCompleted ? 0.8 : isActive ? 0.95 : 0.7,
                weight: isActive ? 3 : 1.5
              }}
            />
          );
        })}
        {userPosition && (
          <CircleMarker
            center={[userPosition.lat, userPosition.lng]}
            radius={8}
            pathOptions={{
              color: '#2563eb',
              fillColor: '#3b82f6',
              fillOpacity: 0.9,
              weight: 2
            }}
          />
        )}
      </MapContainer>
    </div>
  );
};

export default RunMap;
