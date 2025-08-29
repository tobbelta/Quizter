import L from 'leaflet';

const neuShadowFilter =
  '<filter id="neu-shadow" x="-50%" y="-50%" width="200%" height="200%">' +
    '<feOffset result="offset" in="SourceAlpha" dx="3" dy="3" />' +
    '<feColorMatrix result="matrix" in="offset" type="matrix" values="0 0 0 0 0.1  0 0 0 0 0.1  0 0 0 0 0.1  0 0 0 1 0" />' +
    '<feMerge>' +
      '<feMergeNode in="matrix" />' +
      '<feMergeNode in="SourceGraphic" />' +
    '</feMerge>' +
  '</filter>';

export const createPlayerIcon = (color) => {
  const svg =
    '<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' + neuShadowFilter + '</defs>' +
      '<g filter="url(#neu-shadow)">' +
        '<circle cx="18" cy="18" r="12" fill="' + color + '" stroke="#f0f0f0" stroke-width="2"/>' +
        '<circle cx="18" cy="18" r="16" fill="none" stroke="#f0f0f0" stroke-width="2" stroke-dasharray="4 4">' +
          '<animateTransform attributeName="transform" type="rotate" from="0 18 18" to="360 18 18" dur="10s" repeatCount="indefinite" />' +
        '</circle>' +
      '</g>' +
    '</svg>';

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
};

export const selfIcon = createPlayerIcon('#007BFF');
export const teammateIcon = createPlayerIcon('#ff00ff');

const createPoiIcon = (options) => {
  return L.divIcon({
    html: options.svg,
    className: '',
    iconSize: [38, 42],
    iconAnchor: [19, 42],
    popupAnchor: [0, -45],
  });
};

const poiSvg = (bgColor, text) =>
  '<svg width="38" height="42" viewBox="0 0 38 42" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' + neuShadowFilter + '</defs>' +
    '<g filter="url(#neu-shadow)">' +
      '<path d="M2 40V2H36V26H20L11 33L20 26" fill="' + bgColor + '" stroke="#f0f0f0" stroke-width="2" />' +
      '<text x="19" y="18" font-family="monospace" font-size="16" fill="#1a1a1a" text-anchor="middle" font-weight="bold">' + text + '</text>' +
    '</g>' +
  '</svg>';

const finishSvg =
  '<svg width="38" height="42" viewBox="0 0 38 42" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' + neuShadowFilter + '</defs>' +
    '<g filter="url(#neu-shadow)">' +
      '<path d="M2 40V2H36V26H2V40" fill="#a3ff00" stroke="#f0f0f0" stroke-width="2" />' +
      '<path d="M2 2H19V14H2V26H19V14Z" fill="#1a1a1a" />' +
      '<path d="M19 2H36V14H19V26H36V14Z" fill="#f0f0f0" />' +
    '</g>' +
  '</svg>';

export const startIcon = createPoiIcon({ svg: poiSvg('#a3ff00', 'S') });
export const finishIcon = createPoiIcon({ svg: finishSvg });
export const obstacleIcon = createPoiIcon({ svg: poiSvg('#ffff00', '!') });
