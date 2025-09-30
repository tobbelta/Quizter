/**
 * MigrationService - Migrerar lokala rundor till Firebase vid login
 */
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb, hasFirebaseConfig } from '../firebaseClient';
import { localStorageService } from './localStorageService';

/**
 * Migrerar alla lokala rundor till användarens Firebase-konto
 */
export const migrateLocalDataToFirebase = async (userId) => {
  if (!hasFirebaseConfig()) {
    console.warn('[Migration] Firebase är inte konfigurerat');
    return { success: false, error: 'Firebase är inte konfigurerat' };
  }

  // Kontrollera om data redan har migrerats
  if (localStorageService.hasBeenMigrated()) {
    console.info('[Migration] Data har redan migrerats tidigare');
    return { success: true, alreadyMigrated: true };
  }

  // Hämta lokal data
  const { createdRuns, joinedRuns } = localStorageService.getDataForMigration();

  if (createdRuns.length === 0 && joinedRuns.length === 0) {
    console.info('[Migration] Ingen lokal data att migrera');
    return { success: true, noData: true };
  }

  const db = getFirebaseDb();
  const results = {
    createdRuns: { success: 0, failed: 0 },
    joinedRuns: { success: 0, failed: 0 }
  };

  try {
    // Migrera skapade rundor
    for (const run of createdRuns) {
      try {
        const runRef = doc(db, 'runs', run.id);
        await setDoc(runRef, {
          ...run,
          migratedFrom: 'localStorage',
          migratedAt: serverTimestamp(),
          ownerId: userId
        }, { merge: true });
        results.createdRuns.success++;
      } catch (error) {
        console.error('[Migration] Kunde inte migrera skapad runda:', error);
        results.createdRuns.failed++;
      }
    }

    // Migrera deltagna rundor
    for (const joined of joinedRuns) {
      try {
        const participantRef = doc(db, 'runs', joined.runId, 'participants', joined.participantData.id);
        await setDoc(participantRef, {
          ...joined.participantData,
          userId,
          migratedFrom: 'localStorage',
          migratedAt: serverTimestamp()
        }, { merge: true });
        results.joinedRuns.success++;
      } catch (error) {
        console.error('[Migration] Kunde inte migrera deltagen runda:', error);
        results.joinedRuns.failed++;
      }
    }

    // Markera som migrerad
    localStorageService.markAsMigrated();

    return {
      success: true,
      results,
      totalMigrated: results.createdRuns.success + results.joinedRuns.success
    };

  } catch (error) {
    console.error('[Migration] Fel vid migrering:', error);
    return {
      success: false,
      error: error.message,
      results
    };
  }
};

/**
 * Kontrollerar om användaren har lokal data som kan migreras
 */
export const shouldPromptMigration = () => {
  return localStorageService.hasLocalData() && !localStorageService.hasBeenMigrated();
};

export const migrationService = {
  migrateLocalDataToFirebase,
  shouldPromptMigration
};