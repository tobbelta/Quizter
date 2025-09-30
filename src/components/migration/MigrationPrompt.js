/**
 * MigrationPrompt - Visar en dialog för att migrera lokal data till Firebase
 */
import React, { useState } from 'react';
import { localStorageService } from '../../services/localStorageService';
import { migrationService } from '../../services/migrationService';
import { useAuth } from '../../context/AuthContext';

const MigrationPrompt = ({ onClose }) => {
  const { currentUser } = useAuth();
  const [isMigrating, setIsMigrating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { createdRuns, joinedRuns } = localStorageService.getDataForMigration();

  const handleMigrate = async () => {
    if (!currentUser) {
      setError('Du måste vara inloggad för att migrera data');
      return;
    }

    setIsMigrating(true);
    setError('');

    try {
      const result = await migrationService.migrateLocalDataToFirebase(currentUser.id);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onClose?.();
        }, 2000);
      } else {
        setError(result.error || 'Kunde inte migrera data');
      }
    } catch (err) {
      setError(err.message || 'Ett oväntat fel uppstod');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleSkip = () => {
    // Markera som migrerad för att inte visa dialogen igen
    localStorageService.markAsMigrated();
    onClose?.();
  };

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-900 rounded-lg border border-emerald-500/50 p-6 max-w-md w-full">
          <div className="text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-emerald-300 mb-2">
              Migrering klar!
            </h2>
            <p className="text-gray-300">
              Dina rundor har sparats i ditt konto
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg border border-slate-700 p-6 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">Flytta dina rundor till kontot?</h2>

        <div className="mb-6">
          <p className="text-gray-300 mb-4">
            Vi har hittat rundor som du har skapat eller deltagit i utan att vara inloggad.
            Vill du flytta dessa till ditt konto?
          </p>

          <div className="bg-slate-800 rounded-lg p-4 space-y-2">
            {createdRuns.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-2xl">✨</span>
                <span className="text-gray-200">
                  <strong>{createdRuns.length}</strong> skapade rund{createdRuns.length === 1 ? 'a' : 'or'}
                </span>
              </div>
            )}
            {joinedRuns.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-2xl">🎯</span>
                <span className="text-gray-200">
                  <strong>{joinedRuns.length}</strong> deltagen{joinedRuns.length === 1 ? '' : 'a'} rund{joinedRuns.length === 1 ? 'a' : 'or'}
                </span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-900/30 border border-red-500/50 rounded-lg p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            disabled={isMigrating}
            className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-gray-200 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Hoppa över
          </button>
          <button
            onClick={handleMigrate}
            disabled={isMigrating}
            className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isMigrating ? 'Flyttar...' : 'Ja, flytta'}
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-400 text-center">
          Om du hoppar över sparas rundorna fortfarande lokalt, men de kopplas inte till ditt konto
        </p>
      </div>
    </div>
  );
};

export default MigrationPrompt;