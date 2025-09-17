import L from 'leaflet';
import { Marker, Popup, Circle } from 'react-leaflet';
import React from 'react';

// Ikon för startpunkten
export const startIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    shadowSize: [41, 41]
});

// Ikon för slutpunkten (mål)
export const finishIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    shadowSize: [41, 41]
});

// Ikon för den egna spelaren
export const selfIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    shadowSize: [41, 41]
});

// Ikon för lagledare
export const leaderIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    shadowSize: [41, 41]
});

// Ikon för vanliga lagkamrater
const teamIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    shadowSize: [41, 41]
});

// Ikon för ett aktivt hinder
const activeObstacleIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    shadowSize: [41, 41]
});

// KORRIGERING: Exporterar nu `activeObstacleIcon` under det gamla namnet `obstacleIcon` för bakåtkompatibilitet
export { activeObstacleIcon as obstacleIcon };

// Ikon för ett avklarat hinder
const completedObstacleIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    shadowSize: [41, 41]
});

// KORRIGERING: Tillagd funktion som saknades för att skapa spelarikoner med olika färger.
const playerColors = ['violet', 'orange', 'yellow', 'red', 'grey', 'black'];
const playerIconCache = {};

export const createPlayerIcon = (index) => {
    const colorIndex = index % playerColors.length;
    const color = playerColors[colorIndex];

    if (playerIconCache[color]) {
        return playerIconCache[color];
    }

    const icon = new L.Icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        shadowSize: [41, 41]
    });

    playerIconCache[color] = icon;
    return icon;
};

// TeamMarker-komponent
export const TeamMarker = ({ member, isLeader }) => {
    if (!member.position || typeof member.position.latitude !== 'number' || typeof member.position.longitude !== 'number') {
        return null;
    }
    const iconToUse = isLeader ? leaderIcon : teamIcon;
    const popupText = `${member.displayName || 'Okänd spelare'}${isLeader ? ' (Lagledare)' : ''}`;

    return (
        <Marker position={[member.position.latitude, member.position.longitude]} icon={iconToUse}>
            <Popup>{popupText}</Popup>
        </Marker>
    );
};

// ObstacleMarker-komponent
export const ObstacleMarker = ({ obstacle, isCompleted }) => {
    const lat = obstacle.location?.latitude || obstacle.lat;
    const lng = obstacle.location?.longitude || obstacle.lng;
    const radius = obstacle.radius || 15;

    if (typeof lat !== 'number' || typeof lng !== 'number') return null;

    const icon = isCompleted ? completedObstacleIcon : activeObstacleIcon;
    const color = isCompleted ? 'purple' : 'orange';

    return (
        <React.Fragment>
            <Marker position={[lat, lng]} icon={icon}>
                <Popup>
                    {obstacle.name || `Hinder`}
                    <br />
                    {isCompleted ? 'Avklarat' : 'Aktivt'}
                </Popup>
            </Marker>
            <Circle center={[lat, lng]} radius={radius} pathOptions={{ color, fillColor: color, fillOpacity: 0.2 }} />
        </React.Fragment>
    );
};