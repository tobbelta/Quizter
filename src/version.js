// Version info för GeoQuest
// Uppdatera detta manuellt när du gör ändringar
export const VERSION = {
  major: 2,
  minor: 8,
  patch: 40,
  build: Date.now(),
  description: "Fix: Återställd debug UI - inställningar (⚙️) och aktiva användare (👥) knappar"
};

export const getVersionString = () => {
  return `v${VERSION.major}.${VERSION.minor}.${VERSION.patch}`;
};

export const getFullVersionString = () => {
  const buildDate = new Date(VERSION.build).toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${getVersionString()} (${buildDate})`;
};

export const getBuildInfo = () => {
  return {
    version: getVersionString(),
    fullVersion: getFullVersionString(),
    description: VERSION.description,
    buildTimestamp: VERSION.build
  };
};

// Förbättrad uppdateringskontroll för utvecklingsläge
export const checkForUpdates = async () => {
  try {
    console.log('checkForUpdates körs, NODE_ENV:', process.env.NODE_ENV);

    // I utvecklingsläge, kontrollera baserat på byggversion
    if (process.env.NODE_ENV === 'development') {
      const currentBuildTime = VERSION.build;
      let lastKnownBuild, lastCheckTime;

      try {
        lastKnownBuild = localStorage.getItem('lastKnownBuild');
        lastCheckTime = localStorage.getItem('lastUpdateCheck');
      } catch (e) {
        console.warn('localStorage inte tillgängligt:', e);
        lastKnownBuild = null;
        lastCheckTime = null;
      }

      const now = Date.now();

      console.log('Uppdateringskontroll:', {
        currentBuildTime,
        lastKnownBuild: lastKnownBuild ? parseInt(lastKnownBuild) : null,
        buildChanged: lastKnownBuild && parseInt(lastKnownBuild) !== currentBuildTime
      });

      // Om byggtiden har ändrats sedan senast = det finns en uppdatering
      if (lastKnownBuild && parseInt(lastKnownBuild) !== currentBuildTime) {
        // Uppdatera den sparade byggtiden
        try {
          localStorage.setItem('lastKnownBuild', currentBuildTime.toString());
          localStorage.setItem('lastUpdateCheck', now.toString());
        } catch (e) {
          console.warn('Kunde inte spara till localStorage:', e);
        }

        return {
          hasUpdate: true,
          currentVersion: getVersionString(),
          serverVersion: getVersionString(), // Ny version är samma som current (byggtiden skiljer)
          message: 'Ny version tillgänglig!'
        };
      }

      // Om det inte finns någon sparad byggtid, spara nuvarande
      if (!lastKnownBuild) {
        try {
          localStorage.setItem('lastKnownBuild', currentBuildTime.toString());
        } catch (e) {
          console.warn('Kunde inte spara initial build till localStorage:', e);
        }
      }

      // Begränsa frekvensen av kontroller (max var 30:e sekund)
      if (lastCheckTime && now - parseInt(lastCheckTime) < 30000) {
        return {
          hasUpdate: false,
          message: 'Kontrollerade nyligen - ingen uppdatering'
        };
      }

      try {
        localStorage.setItem('lastUpdateCheck', now.toString());
      } catch (e) {
        console.warn('Kunde inte spara lastUpdateCheck:', e);
      }
      return {
        hasUpdate: false,
        message: 'Du har den senaste versionen (utvecklingsläge)'
      };
    }

    // För produktion, försök hämta index.html och kolla efter nya assets
    const response = await fetch('/?t=' + Date.now(), {
      cache: 'no-cache',
      method: 'HEAD'
    });

    if (response.ok) {
      // Enkel kontroll - om vi kan hämta sidan så finns det potentiellt uppdateringar
      const etag = response.headers.get('etag');
      let lastEtag;

      try {
        lastEtag = localStorage.getItem('lastEtag');
      } catch (e) {
        console.warn('localStorage inte tillgängligt i produktion:', e);
        lastEtag = null;
      }

      if (etag && etag !== lastEtag) {
        try {
          localStorage.setItem('lastEtag', etag);
        } catch (e) {
          console.warn('Kunde inte spara etag:', e);
        }
        return {
          hasUpdate: true,
          currentVersion: getVersionString(),
          serverVersion: 'Ny version'
        };
      }
    }

    return { hasUpdate: false, message: 'Du har den senaste versionen' };
  } catch (error) {
    return { hasUpdate: false, error: `Uppdateringskontroll misslyckades: ${error.message}` };
  }
};