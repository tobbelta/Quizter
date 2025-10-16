/**
 * Visar rundans checkpoints på en Leaflet-karta, följer spelaren och visar ruttens riktning.
 */
import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-polylinedecorator'; // Importera för att rita pilar
import L from 'leaflet'; // Behövs för PolylineDecorator
import { DEFAULT_CENTER } from '../../utils/constants';

// Skapa en custom ikon för startpunkten
const createStartFinishIcon = () => {
  return L.divIcon({
    html: `
      <div style="
        background: #22c55e;
        color: white;
        border: 3px solid white;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        font-weight: bold;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">🏁</div>
    `,
    className: 'custom-start-finish-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
};

// Skapa en tydlig ikon för användarens position
const createUserPositionIcon = () => {
  return L.divIcon({
    html: `
      <div style="
        background: #3b82f6;
        color: white;
        border: 4px solid white;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.6), 0 0 0 4px rgba(59, 130, 246, 0.2);
        animation: pulse 2s ease-in-out infinite;
      ">📍</div>
      <style>
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      </style>
    `,
    className: 'custom-user-position-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
};

// Skapa en numrerad checkpoint-ikon
const createCheckpointIcon = (number, color, isActive, isClickable = false) => {
  const size = isActive ? 36 : 32;
  return L.divIcon({
    html: `
      <div style="
        background: ${color};
        color: white;
        border: 3px solid white;
        border-radius: 50%;
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${isActive ? '16px' : '14px'};
        font-weight: bold;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        ${isActive ? 'box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.3);' : ''}
        ${isClickable ? 'cursor: pointer; transition: transform 0.2s;' : ''}
      "
      ${isClickable ? 'class="clickable-checkpoint"' : ''}
      >${number}</div>
      ${isClickable ? `
        <style>
          .clickable-checkpoint:hover {
            transform: scale(1.15);
          }
        </style>
      ` : ''}
    `,
    className: 'custom-checkpoint-icon',
    iconSize: [size, size],
    iconAnchor: [size/2, size/2]
  });
};

/**
 * Justerar kartans gränser för att passa alla checkpoints.
 */
const FitBounds = ({ positions }) => {
  const map = useMap();

  useEffect(() => {
    if (positions && positions.length > 0) {
      map.fitBounds(positions, { padding: [50, 50] });
    }
  }, [positions, map]);

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
const RunMap = ({
  checkpoints,
  userPosition,
  activeOrder,
  answeredCount,
  route,
  startPoint,
  className = 'h-full',
  onCheckpointClick = null,  // Callback för klick på checkpoint (när GPS är av)
  manualMode = false         // Om true, gör checkpoints klickbara
}) => {
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
    if (userPosition) {
      return [userPosition.lat, userPosition.lng];
    }
    if (positions.length > 0) {
      const lats = positions.map(p => p[0]);
      const lngs = positions.map(p => p[1]);
      return [lats.reduce((a, b) => a + b, 0) / lats.length, lngs.reduce((a, b) => a + b, 0) / lngs.length];
    }
    return DEFAULT_CENTER;
  }, [userPosition, positions]);

  return (
    <div className={`w-full overflow-hidden relative ${className}`}>
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: '100%', width: '100%' }} // Tvinga full höjd och bredd
        className="h-full w-full relative z-0"
        scrollWheelZoom={true}
        zoomControl={true}
        doubleClickZoom={true}
        touchZoom={true}
        dragging={true}
      >
        <FitBounds positions={positions} />
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
          const key = checkpoints[index].questionId || checkpoints[index].order || index;
          const checkpointNumber = index + 1;
          const isClickable = manualMode && !isCompleted;

          const markerProps = {
            position,
            icon: createCheckpointIcon(checkpointNumber, color, isActive, isClickable)
          };

          // Lägg till eventHandlers om checkpoint är klickbar
          if (isClickable && onCheckpointClick) {
            markerProps.eventHandlers = {
              click: () => {
                onCheckpointClick(index);
              }
            };
          }

          return <Marker key={key} {...markerProps} />;
        })}
        {/* Startpunkt/Målpunkt - visas med flagg-ikon */}
        {startPoint && (
          <Marker
            position={[startPoint.lat, startPoint.lng]}
            icon={createStartFinishIcon()}
          />
        )}
        {userPosition && (
          <Marker
            position={[userPosition.lat, userPosition.lng]}
            icon={createUserPositionIcon()}
          />
        )}
      </MapContainer>
    </div>
  );
};

export default RunMap;
