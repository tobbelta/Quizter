/**
 * Beräknar avståndet mellan två geografiska punkter i meter med Haversine-formeln.
 * @param {number} lat1 - Latitud för punkt 1.
 * @param {number} lon1 - Longitud för punkt 1.
 * @param {number} lat2 - Latitud för punkt 2.
 * @param {number} lon2 - Longitud för punkt 2.
 * @returns {number} - Avståndet i meter.
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Jordens radie i meter
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Avstånd i meter
}
