// Version info för GeoQuest
// Uppdatera detta manuellt när du gör ändringar
export const VERSION = {
  major: 2,
  minor: 15,
  patch: 0,
  build: Date.now(),
  description: "Feature: Visibility-status för spelare - se om lagmedlemmar har spelet synligt eller minimerat/dolt"
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

// Förbättrad uppdateringskontroll som fungerar överallt
export const checkForUpdates = async () => {
  try {
    console.log('🔄 checkForUpdates körs, NODE_ENV:', process.env.NODE_ENV);

    // Använd både version och build för att detektera ändringar
    const currentVersionString = `${VERSION.major}.${VERSION.minor}.${VERSION.patch}`;
    const currentBuildTime = VERSION.build;

    let lastKnownVersion, lastKnownBuild;

    try {
      lastKnownVersion = localStorage.getItem('geoquest-last-version');
      lastKnownBuild = localStorage.getItem('geoquest-last-build');
    } catch (e) {
      console.warn('localStorage inte tillgängligt:', e);
      lastKnownVersion = null;
      lastKnownBuild = null;
    }

    console.log('📊 Version check:', {
      currentVersion: currentVersionString,
      lastKnownVersion,
      currentBuild: currentBuildTime,
      lastKnownBuild: lastKnownBuild ? parseInt(lastKnownBuild) : null,
      versionChanged: lastKnownVersion && lastKnownVersion !== currentVersionString,
      buildChanged: lastKnownBuild && parseInt(lastKnownBuild) !== currentBuildTime
    });

    // Kontrollera om version eller build har ändrats
    const versionChanged = lastKnownVersion && lastKnownVersion !== currentVersionString;
    const buildChanged = lastKnownBuild && parseInt(lastKnownBuild) !== currentBuildTime;

    if (versionChanged || buildChanged) {
      // Uppdatera sparade värden
      try {
        localStorage.setItem('geoquest-last-version', currentVersionString);
        localStorage.setItem('geoquest-last-build', currentBuildTime.toString());
      } catch (e) {
        console.warn('Kunde inte spara till localStorage:', e);
      }

      const changeType = versionChanged ? 'version' : 'build';
      console.log(`✅ Uppdatering upptäckt! (${changeType} ändring)`);

      return {
        hasUpdate: true,
        currentVersion: lastKnownVersion || 'okänd',
        serverVersion: `v${currentVersionString}`,
        message: `Ny ${versionChanged ? 'version' : 'build'} tillgänglig!`,
        changeType: changeType
      };
    }

    // Rensa gamla localStorage-nycklar från tidigare versioner
    try {
      const oldKeys = ['lastKnownBuild', 'lastUpdateCheck', 'lastEtag'];
      oldKeys.forEach(key => {
        if (localStorage.getItem(key) !== null) {
          localStorage.removeItem(key);
          console.log(`🧹 Rensade gammal localStorage-nyckel: ${key}`);
        }
      });

      // Engångsrensning för version 2.9.2 - forcera uppdateringsdetektering
      const forceUpdateFlag = localStorage.getItem('geoquest-force-update-292');
      if (!forceUpdateFlag) {
        localStorage.removeItem('geoquest-last-version');
        localStorage.removeItem('geoquest-last-build');
        localStorage.setItem('geoquest-force-update-292', 'done');
        console.log('🔄 Forcerar uppdateringsdetektering för version 2.9.2');
      }
    } catch (e) {
      // Ignorera fel vid rensning
    }

    // Om det inte finns några sparade värden, spara nuvarande (första gången)
    if (!lastKnownVersion || !lastKnownBuild) {
      try {
        localStorage.setItem('geoquest-last-version', currentVersionString);
        localStorage.setItem('geoquest-last-build', currentBuildTime.toString());
      } catch (e) {
        console.warn('Kunde inte spara initial version/build till localStorage:', e);
      }
      console.log('💾 Sparade initial version och build');
    }

    return {
      hasUpdate: false,
      message: `Du har den senaste versionen (v${currentVersionString})`
    };

  } catch (error) {
    console.error('❌ Uppdateringskontroll misslyckades:', error);
    return { hasUpdate: false, error: `Uppdateringskontroll misslyckades: ${error.message}` };
  }
};