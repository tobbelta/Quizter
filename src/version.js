/**
 * Versionshantering för GeoQuest
 *
 * Använd Semantic Versioning (SemVer): MAJOR.MINOR.PATCH
 * - MAJOR: Inkompatibla API-ändringar
 * - MINOR: Nya funktioner, bakåtkompatibelt
 * - PATCH: Buggfixar, bakåtkompatibelt
 */

export const VERSION = '2.1.0';
export const BUILD_DATE = new Date().toISOString();
export const FEATURES = {
  localStorage: true,
  migration: true,
  donations: true,
  superuser: true,
  simplifiedUI: true
};

export const CHANGELOG = [
  {
    version: '2.0.0',
    date: '2025-09-30',
    changes: [
      'Förenklad användarupplevelse med 2 huvudknappar',
      'Ta bort rollsystem - alla kan skapa/ansluta',
      'Ny SuperUser-roll för administration',
      'Hamburger-meny med Mina rundor',
      'LocalStorage för oinloggade användare',
      'Automatisk migrering till Firebase vid login',
      'Frivilliga donationer istället för obligatorisk betalning',
      'Endast ID:n sparas i localStorage',
      'Versionshantering implementerad'
    ]
  },
  {
    version: '1.0.0',
    date: '2025-01-01',
    changes: [
      'Initial release',
      'Firebase-integration',
      'Ruttgenerering med OpenRouteService',
      'QR-koder och join-länkar',
      'Grundläggande spelvy med karta',
      'Frågebank med OpenTDB-import'
    ]
  }
];

/**
 * Kontrollerar om localStorage behöver migreras baserat på version
 */
export const checkLocalStorageVersion = () => {
  if (typeof window === 'undefined') return { needsMigration: false, oldVersion: null };

  const storedVersion = localStorage.getItem('geoquest:version');

  if (!storedVersion) {
    // Första gången applikationen körs, sätt version
    localStorage.setItem('geoquest:version', VERSION);
    localStorage.setItem('geoquest:build_date', BUILD_DATE);
    return { needsMigration: false, oldVersion: null };
  }

  if (storedVersion !== VERSION) {
    console.info(`[Version] Uppdatering från ${storedVersion} till ${VERSION}`);
    localStorage.setItem('geoquest:version', VERSION);
    localStorage.setItem('geoquest:build_date', BUILD_DATE);
    return { needsMigration: true, oldVersion: storedVersion };
  }

  return { needsMigration: false, oldVersion: storedVersion };
};

/**
 * Hämtar versionsinfo
 */
export const getVersionInfo = () => ({
  version: VERSION,
  buildDate: BUILD_DATE,
  features: FEATURES,
  changelog: CHANGELOG
});

const versionModule = {
  VERSION,
  BUILD_DATE,
  FEATURES,
  CHANGELOG,
  checkLocalStorageVersion,
  getVersionInfo
};

export default versionModule;