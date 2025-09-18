import L from 'leaflet';
import { Marker, Popup, Circle } from 'react-leaflet';
import React from 'react';
import './MapIcons.css';

// SVG för startpunkt med flagga
const startIconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <g>
    <rect x="14" y="6" width="2" height="20" fill="#8B4513"/>
    <path d="M16 6 L16 16 L26 12 L16 8 Z" fill="#00FF00" stroke="#008000" stroke-width="1"/>
    <circle cx="16" cy="26" r="4" fill="#4CAF50" stroke="#2E7D32" stroke-width="2"/>
    <text x="16" y="29" text-anchor="middle" fill="white" font-size="8" font-weight="bold">S</text>
  </g>
</svg>`;

export const startIcon = new L.DivIcon({
    html: startIconSvg,
    iconSize: [32, 32],
    iconAnchor: [16, 26],
    popupAnchor: [0, -26],
    className: 'custom-start-icon'
});

// SVG för målpunkt med korsad flagga
const finishIconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <g>
    <rect x="14" y="6" width="2" height="20" fill="#8B4513"/>
    <path d="M16 6 L16 16 L26 12 L16 8 Z" fill="#FF0000" stroke="#CC0000" stroke-width="1"/>
    <path d="M18 8 L24 12 M18 12 L24 8" stroke="white" stroke-width="2"/>
    <circle cx="16" cy="26" r="4" fill="#F44336" stroke="#D32F2F" stroke-width="2"/>
    <text x="16" y="29" text-anchor="middle" fill="white" font-size="8" font-weight="bold">M</text>
  </g>
</svg>`;

export const finishIcon = new L.DivIcon({
    html: finishIconSvg,
    iconSize: [32, 32],
    iconAnchor: [16, 26],
    popupAnchor: [0, -26],
    className: 'custom-finish-icon'
});

// SVG för egen spelare - större och blinkande
const selfIconSvg = `<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="selfGrad" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#64B5F6"/>
      <stop offset="100%" stop-color="#1976D2"/>
    </radialGradient>
  </defs>
  <g class="self-icon-pulse">
    <circle cx="18" cy="28" r="6" fill="url(#selfGrad)" stroke="#0D47A1" stroke-width="3"/>
    <circle cx="18" cy="15" r="8" fill="#2196F3" stroke="#1565C0" stroke-width="2"/>
    <circle cx="18" cy="13" r="3" fill="white"/>
    <circle cx="17" cy="12" r="1" fill="#1976D2"/>
    <path d="M13 18 Q18 16 23 18 Q21 22 18 23 Q15 22 13 18" fill="#FFCC80"/>
    <text x="18" y="31" text-anchor="middle" fill="white" font-size="8" font-weight="bold">JAG</text>
  </g>
</svg>`;

export const selfIcon = new L.DivIcon({
    html: selfIconSvg,
    iconSize: [36, 36],
    iconAnchor: [18, 28],
    popupAnchor: [0, -28],
    className: 'custom-self-icon'
});

// SVG för lagledare - guld med krona
const leaderIconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="leaderGrad" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#FFD700"/>
      <stop offset="100%" stop-color="#B8860B"/>
    </radialGradient>
  </defs>
  <g class="leader-icon-glow">
    <circle cx="16" cy="24" r="5" fill="url(#leaderGrad)" stroke="#B8860B" stroke-width="2"/>
    <circle cx="16" cy="14" r="6" fill="#FFC107" stroke="#FF8F00" stroke-width="2"/>
    <circle cx="16" cy="12" r="2" fill="white"/>
    <circle cx="15.5" cy="11.5" r="0.5" fill="#FF8F00"/>
    <path d="M11 16 Q16 14 21 16 Q19 20 16 21 Q13 20 11 16" fill="#FFCC80"/>
    <!-- Krona -->
    <path d="M12 8 L14 6 L16 8 L18 6 L20 8 L19 12 L13 12 Z" fill="#FFD700" stroke="#B8860B" stroke-width="1"/>
    <circle cx="14" cy="8" r="1" fill="#FF5722"/>
    <circle cx="16" cy="6" r="1" fill="#FF5722"/>
    <circle cx="18" cy="8" r="1" fill="#FF5722"/>
    <text x="16" y="27" text-anchor="middle" fill="white" font-size="6" font-weight="bold">LED</text>
  </g>
</svg>`;

export const leaderIcon = new L.DivIcon({
    html: leaderIconSvg,
    iconSize: [32, 32],
    iconAnchor: [16, 24],
    popupAnchor: [0, -24],
    className: 'custom-leader-icon'
});

// Funktioner för olika lagmedlems-färger baserat på person
const playerColors = [
    { name: 'blue', primary: '#2196F3', secondary: '#1565C0' },
    { name: 'green', primary: '#4CAF50', secondary: '#2E7D32' },
    { name: 'orange', primary: '#FF9800', secondary: '#E65100' },
    { name: 'purple', primary: '#9C27B0', secondary: '#6A1B9A' },
    { name: 'red', primary: '#F44336', secondary: '#C62828' },
    { name: 'teal', primary: '#009688', secondary: '#00695C' },
    { name: 'pink', primary: '#E91E63', secondary: '#AD1457' },
    { name: 'indigo', primary: '#3F51B5', secondary: '#283593' }
];

const createTeamMemberIcon = (memberIndex) => {
    const colorIndex = memberIndex % playerColors.length;
    const color = playerColors[colorIndex];

    const teamIconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="teamGrad${memberIndex}" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stop-color="${color.primary}"/>
          <stop offset="100%" stop-color="${color.secondary}"/>
        </radialGradient>
      </defs>
      <g class="team-member-pulse">
        <circle cx="14" cy="22" r="4" fill="url(#teamGrad${memberIndex})" stroke="${color.secondary}" stroke-width="2"/>
        <circle cx="14" cy="12" r="5" fill="${color.primary}" stroke="${color.secondary}" stroke-width="1.5"/>
        <circle cx="14" cy="10" r="2" fill="white"/>
        <circle cx="13.5" cy="9.5" r="0.5" fill="${color.secondary}"/>
        <path d="M10 15 Q14 13 18 15 Q17 18 14 19 Q11 18 10 15" fill="#FFCC80"/>
      </g>
    </svg>`;

    return new L.DivIcon({
        html: teamIconSvg,
        iconSize: [28, 28],
        iconAnchor: [14, 22],
        popupAnchor: [0, -22],
        className: 'custom-team-icon'
    });
};

// Cache för team ikoner
const teamIconCache = {};

// SVG för aktivt hinder - frågetechen med pulsering
const activeObstacleIconSvg = `<svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="obstacleGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FF9800"/>
      <stop offset="100%" stop-color="#E65100"/>
    </radialGradient>
  </defs>
  <g class="obstacle-pulse">
    <circle cx="15" cy="15" r="12" fill="url(#obstacleGrad)" stroke="#BF360C" stroke-width="2"/>
    <path d="M12 10 Q15 7 18 10 Q18 12 16 13 L16 16 M16 19 L16 20"
          stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    <circle cx="16" cy="22" r="1" fill="white"/>
  </g>
</svg>`;

const activeObstacleIcon = new L.DivIcon({
    html: activeObstacleIconSvg,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
    className: 'custom-obstacle-icon'
});

// KORRIGERING: Exporterar nu `activeObstacleIcon` under det gamla namnet `obstacleIcon` för bakåtkompatibilitet
export { activeObstacleIcon as obstacleIcon };

// SVG för avklarat hinder - checkmark
const completedObstacleIconSvg = `<svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="completedGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#4CAF50"/>
      <stop offset="100%" stop-color="#2E7D32"/>
    </radialGradient>
  </defs>
  <circle cx="15" cy="15" r="12" fill="url(#completedGrad)" stroke="#1B5E20" stroke-width="2"/>
  <path d="M9 15 L13 19 L21 11" stroke="white" stroke-width="3" stroke-linecap="round" fill="none"/>
</svg>`;

const completedObstacleIcon = new L.DivIcon({
    html: completedObstacleIconSvg,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
    className: 'custom-completed-obstacle-icon'
});

// Exporterar funktion för att skapa team member ikoner
export const createPlayerIcon = (index) => {
    if (teamIconCache[index]) {
        return teamIconCache[index];
    }

    const icon = createTeamMemberIcon(index);
    teamIconCache[index] = icon;
    return icon;
};

// TeamMarker-komponent med personbaserade färger
export const TeamMarker = ({ member, isLeader, memberIndex = 0 }) => {
    if (!member.position || typeof member.position.latitude !== 'number' || typeof member.position.longitude !== 'number') {
        return null;
    }

    const iconToUse = isLeader ? leaderIcon : createPlayerIcon(memberIndex);
    const popupText = `${member.displayName || 'Okänd spelare'}${isLeader ? ' (Lagledare)' : ''}`;

    return (
        <Marker position={[member.position.latitude, member.position.longitude]} icon={iconToUse}>
            <Popup>{popupText}</Popup>
        </Marker>
    );
};

// ObstacleMarker-komponent
export const ObstacleMarker = ({ obstacle, isCompleted }) => {
    // Försök hitta koordinater i olika strukturer
    const lat = obstacle.location?.latitude || obstacle.position?.lat || obstacle.lat;
    const lng = obstacle.location?.longitude || obstacle.position?.lng || obstacle.lng;
    const radius = obstacle.radius || 15;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
        console.log('ObstacleMarker: Ogiltiga koordinater för obstacle:', obstacle);
        return null;
    }

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