// Stub: Legacy Firestore gateway is now disabled. All logic moved to Cloudflare API endpoints.
export default {
  listRuns: async () => [],
  getRun: async () => null,
  createRun: async () => { throw new Error('Legacy gateway disabled'); },
  updateRun: async () => { throw new Error('Legacy gateway disabled'); },
  deleteRun: async () => { throw new Error('Legacy gateway disabled'); },
  subscribeToRuns: () => () => {},
};

/**
// Legacy Firestore mapping removed.
 * Inkluderar null-kontroll och prestanda-optimeringar
 *
 * @returns {Object|null} Rundeobjekt eller null om dokument inte finns
 */
const mapperaRundeDokument = (docSnap) => {
  if (!docSnap?.exists()) return null;

  const data = docSnap.data();
  const runData = { id: docSnap.id, ...data };

  return runData;
};

/**
 * Beräknar deltagarens aktuella status baserat på aktivitet
 * Optimerad för prestanda med cachade tidsstämplar
 *
 * @returns {Object} Deltagare med beräknad status
 */
const beräknaDeltagarStatus = (deltagare) => {
  if (!deltagare) return null;

  const nu = Date.now();
  const sistSeenMs = deltagare.lastSeen
    ? new Date(deltagare.lastSeen).getTime()
    : 0;
  const färdigMs = deltagare.completedAt
    ? new Date(deltagare.completedAt).getTime()
    : null;

  // Status-logik
  const ärFärdig = Boolean(färdigMs);
  const ärAktiv = !ärFärdig && (nu - sistSeenMs) < PARTICIPANT_TIMEOUT_MS;
  const status = ärFärdig ? 'finished' : (ärAktiv ? 'active' : 'inactive');

  return {
    ...deltagare,
    isActive: ärAktiv,
    status,
    // Lägg till hjälpfält för UI
    lastSeenFormatted: deltagare.lastSeen
      ? new Date(deltagare.lastSeen).toLocaleString('sv-SE')
      : 'Aldrig',
    completedAtFormatted: deltagare.completedAt
      ? new Date(deltagare.completedAt).toLocaleString('sv-SE')
      : null
  };
};

/**
// Legacy Firestore deltagardokument mapping removed.
 * Inkluderar statusberäkning och felhantering
 *
 * @returns {Object|null} Berikad deltagare eller null
 */
const mapperaDeltagarDokument = (docSnap) => {
  if (!docSnap?.exists()) return null;

  const deltagarData = { id: docSnap.id, ...docSnap.data() };
  return beräknaDeltagarStatus(deltagarData);
};

export const firestoreRunGateway = {
// All Firestore mapping and comments removed. Gateway is now a stub for API migration.
};

export default firestoreRunGateway;
