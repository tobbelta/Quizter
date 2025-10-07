/**
 * Versionshantering för GeoQuest
 *
 * Använd Semantic Versioning (SemVer): MAJOR.MINOR.PATCH
 * - MAJOR: Inkompatibla API-ändringar
 * - MINOR: Nya funktioner, bakåtkompatibelt
 * - PATCH: Buggfixar, bakåtkompatibelt
 */

export const VERSION = '0.4.5';
export const BUILD_DATE = new Date().toISOString();
export const FEATURES = {
  localStorage: true,
  migration: true,
  donations: true,
  superuser: true,
  simplifiedUI: true,
  gpsStatus: true,
  cacheControl: true,
  mapImprovements: true
};

export const CHANGELOG = [
  {
    version: '0.2.3',
    date: '2025-10-06',
    changes: [
      'Kompaktare header-design med bättre mobilanpassning',
      'GPS-status och version flyttad till hamburger-menyn',
      'Klickbara checkpoints på kartan när GPS är avstängd',
      'Borttagen betalningskontroll - alla rundor är gratis',
      'URL-baserad versionskontroll för att undvika cache-problem',
      'Fixad layout-problem i PlayRunPage med fixed header',
      'Förbättrad cache-rensning vid versionsändringar'
    ]
  },
  {
    version: '0.2.2',
    date: '2025-10-06',
    changes: [
      'Tydlig blå 📍-ikon för användarens position på kartan',
      'Checkpointnummer visas på alla checkpoints (1, 2, 3, etc)',
      'Användarens GPS-position visas nu när man skapar runda',
      'Pulsande animation på användarens position för enkel identifiering',
      'Förbättrad kartvisning med numrerade markers istället för cirklar'
    ]
  },
  {
    version: '0.2.1',
    date: '2025-10-06',
    changes: [
      'GPS-status i header med snurrande kompass',
      'Visar GPS-noggrannhet (±m) bredvid logotyp',
      'GPS-aktiverings prompt efter 2 sekunder',
      'Version-visning i header',
      'Aggressiv cache-busting för uppdateringar',
      'Automatisk cache-rensning vid versionsändring'
    ]
  },
  {
    version: '0.2.0',
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
    version: '0.1.0',
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