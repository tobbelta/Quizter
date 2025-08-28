import L from 'leaflet';

const createIcon = (svg) => {
    return L.divIcon({
        html: svg,
        className: '',
        iconSize: [36, 48],
        iconAnchor: [18, 48],
        popupAnchor: [0, -50]
    });
};

export const startIcon = createIcon(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" style="filter: drop-shadow(0 0 3px #00ffff);">
        <path d="M8,5.14V19.14L19,12.14L8,5.14Z" fill="#00ffff"/>
    </svg>
`);

export const finishIcon = createIcon(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" style="filter: drop-shadow(0 0 3px #ffff00);">
        <path d="M6,3V21H8V15H13V13H8V11H13V9H8V7H13V5H8V3H6M14,5H16V7H14V5M16,7H18V9H16V7M14,9H16V11H14V9M16,11H18V13H16V11M14,13H16V15H14V13Z" fill="#ffff00"/>
    </svg>
`);

export const obstacleIcon = createIcon(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" style="filter: drop-shadow(0 0 3px #ff00ff);">
        <path d="M12,2L1,21H23M12,6L19.53,19H4.47M11,10V14H13V10M11,16V18H13V16" fill="#ff00ff"/>
    </svg>
`);

export const createPlayerIcon = (color) => createIcon(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 48" width="36" height="48" style="filter: drop-shadow(0 0 3px ${color});">
        <path d="M16,0 C7.163,0 0,7.163 0,16 C0,24.837 16,48 16,48 C16,48 32,24.837 32,16 C32,7.163 24.837,0 16,0 Z" fill="${color}" stroke="#0d0d1a" stroke-width="1.5"/>
        <circle cx="16" cy="16" r="6" fill="#0d0d1a"/>
    </svg>
`);
