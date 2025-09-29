/**
 * Visar rundans checkpoints på en Leaflet-karta, följer spelaren och visar ruttens riktning.
 */
import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, useMap } from 'react-leaflet';
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
const RunMap = ({ checkpoints, userPosition, activeOrder, answeredCount, route, startPoint }) => {
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

  const { center, zoom } = useMemo(() => {
    if (positions.length === 0) {
      return { center: DEFAULT_CENTER, zoom: 16 };
    }

    // Om vi har användarposition, centrera på den
    if (userPosition) {
      return { center: [userPosition.lat, userPosition.lng], zoom: 17 };
    }

    // Beräkna bounding box för alla checkpoints och startpunkt
    const allPositions = [...positions];
    if (startPoint) {
      allPositions.push([startPoint.lat, startPoint.lng]);
    }

    const lats = allPositions.map(pos => pos[0]);
    const lngs = allPositions.map(pos => pos[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    // Centrera på mitten av bounding box
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    // Beräkna lämplig zoom baserat på spridning
    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    const maxDiff = Math.max(latDiff, lngDiff);

    let calculatedZoom = 16;
    if (maxDiff < 0.001) calculatedZoom = 18;      // Mycket liten runda
    else if (maxDiff < 0.005) calculatedZoom = 17; // Liten runda
    else if (maxDiff < 0.01) calculatedZoom = 16;  // Medium runda
    else if (maxDiff < 0.02) calculatedZoom = 15;  // Stor runda
    else calculatedZoom = 14;                      // Mycket stor runda

    return { center: [centerLat, centerLng], zoom: calculatedZoom };
  }, [userPosition, positions, startPoint]);

  return (
    <div className="h-full w-full overflow-hidden relative">
      <MapContainer
        center={center}
        zoom={zoom}
        className="h-full w-full relative z-0"
        scrollWheelZoom={false}
        zoomControl={false}
        doubleClickZoom={false}
        touchZoom={false}
        dragging={true}
      >
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
        {/* Startpunkt/Målpunkt - visas med flagg-ikon */}
        {startPoint && (
          <Marker
            position={[startPoint.lat, startPoint.lng]}
            icon={createStartFinishIcon()}
          />
        )}
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
