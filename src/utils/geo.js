/**
 * Geografiska hjälpfunktioner för avståndsberäkningar och visning.
 */
/**
 * Omvandlar grader till radianer (hjälp vid haversine-beräkning).
 */
const toRadians = (value) => (value * Math.PI) / 180;

/**
 * Beräknar avståndet mellan två kartpunkter i meter (haversine).
 */
export const calculateDistanceMeters = (pointA, pointB) => {
  if (!pointA || !pointB) return null;
  const { lat: lat1, lng: lng1 } = pointA;
  const { lat: lat2, lng: lng2 } = pointB;
  if ([lat1, lng1, lat2, lng2].some((value) => typeof value !== 'number')) {
    return null;
  }

  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadius * c);
};

/**
 * Formaterar avståndet så att vi visar m eller km beroende på längd.
 */
export const formatDistance = (meters) => {
  if (meters == null) return '-';
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
};
