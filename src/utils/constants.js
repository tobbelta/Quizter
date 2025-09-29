/**
 * Konstanter för applikationen
 */

// Fallback GPS-position för Kalmar Nygatan 13A
// Används när GPS-position inte kan fastställas eller som standardposition
export const FALLBACK_POSITION = {
  lat: 56.6657823,  // Nygatan 13A, Kalmar (exakta koordinater)
  lng: 16.3453025
};

// Alias för bakåtkompatibilitet
export const DEFAULT_ORIGIN = FALLBACK_POSITION;
export const DEFAULT_CENTER = [FALLBACK_POSITION.lat, FALLBACK_POSITION.lng];