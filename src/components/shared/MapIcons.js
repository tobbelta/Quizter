import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import React from 'react';

const createIcon = (svg) => {
    return new L.DivIcon({
        html: svg,
        className: 'custom-leaflet-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
    });
};

export const selfIcon = createIcon(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256">
        <path fill="#58a6ff" d="M128,24a104,104,0,1,0,104,104A104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm0-40a48,48,0,1,1,48-48A48.05,48.05,0,0,1,128,176Zm0-80a32,32,0,1,0,32,32A32,32,0,0,0,128,96Z"/>
    </svg>
`);

export const teammateIcon = createIcon(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256">
        <path fill="#c9d1d9" d="M128,24a104,104,0,1,0,104,104A104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Z"/>
    </svg>
`);

export const startIcon = createIcon(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256">
        <path fill="#2ECC71" d="M228.43,103.57l-88-88a12,12,0,0,0-17,0l-88,88a12,12,0,0,0,17,17L116,67.05V224a12,12,0,0,0,24,0V67.05l53.57,53.57a12,12,0,0,0,17-17Z"/>
    </svg>
`);

export const finishIcon = createIcon(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256">
        <path fill="#f85149" d="M128,24A104,104,0,1,0,104,104,104.11,104.11,0,0,0,128,24Zm41.16,134.84a12,12,0,0,1-17,17L128,150.85l-24.16,25a12,12,0,0,1-17-17L111,133.85,86.84,108.69a12,12,0,0,1,17-17L128,116.85l24.16-25.16a12,12,0,1,1,17,17L145,133.85Z"/>
    </svg>
`);

export const obstacleIcon = createIcon(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256">
        <path fill="#e3b341" d="M239.81,192.31,143.62,24a24,24,0,0,0-43.24,0L4.19,192.31a24,24,0,0,0,21.62,36H218.19a24,24,0,0,0,21.62-36ZM128,152a12,12,0,1,1,12-12A12,12,0,0,1,128,152Zm12-48a12,12,0,0,1-24,0V88a12,12,0,0,1,24,0Z"/>
    </svg>
`);

export const completedObstacleIcon = createIcon(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256">
        <path fill="#30b6c4" d="M239.81,192.31,143.62,24a24,24,0,0,0-43.24,0L4.19,192.31a24,24,0,0,0,21.62,36H218.19a24,24,0,0,0,21.62-36ZM116.48,168.48a12,12,0,0,1-17,0l-24-24a12,12,0,0,1,17-17L104,142.94l39.51-39.52a12,12,0,1,1,17,17Z"/>
    </svg>
`);

export const createPlayerIcon = (color = '#007BFF') => {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256">
        <path fill="${color}" d="M128,24a104,104,0,1,0,104,104A104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Z"/>
    </svg>`;
    return createIcon(svg);
};

export const getIcon = (type, isCompleted) => {
    switch(type) {
        case 'obstacle':
            return isCompleted ? completedObstacleIcon : obstacleIcon;
        default:
            return obstacleIcon;
    }
};

export const TeamMarker = ({ position }) => (
    <Marker position={position} icon={teammateIcon}>
        <Popup>Lagkamrat</Popup>
    </Marker>
);

export const ObstacleMarker = ({ obstacle, isCompleted }) => {
    // **KORRIGERING:** Hanterar både { location: { latitude, longitude } } och { lat, lng }.
    // Detta löser kraschen när databasen använder 'lat' och 'lng'.
    const lat = obstacle.location?.latitude || obstacle.lat;
    const lng = obstacle.location?.longitude || obstacle.lng;
    
    // Säkerhetskontroll för att förhindra krasch om koordinater saknas helt.
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        console.warn("ObstacleMarker received invalid coordinates for obstacle:", obstacle);
        return null; 
    }

    return (
        <Marker 
            position={[lat, lng]} 
            icon={getIcon('obstacle', isCompleted)}
        >
            <Popup>
                <div className="font-bold">{obstacle.name || 'Hinder'}</div>
                {obstacle.riddle && <p className="text-sm mt-1">{obstacle.riddle}</p>}
            </Popup>
        </Marker>
    );
};

