/**
 * Dialog som visas när användare loggar in och har lokala rundor att importera.
 */
import React, { useState } from 'react';
import { runRepository } from '../../repositories/runRepository';
import { localStorageService } from '../../services/localStorageService';

const LocalRunsImportDialog = ({ localRunCount, onComplete, currentUser }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState('');

  const handleImport = async () => {
    setIsImporting(true);
    setStatus('Importerar rundor...');

    try {
      // Hämta lokala rundor från localStorage
      const localRunsMeta = localStorageService.getCreatedRuns();
      const localRunIds = localRunsMeta.map(r => r.runId);

      if (localRunIds.length === 0) {
        setStatus('Inga rundor att importera.');
        setTimeout(() => onComplete(true), 1500);
        return;
      }

      // Hämta faktiska rundor från Firestore
      const runs = await runRepository.listRunsByIds(localRunIds);

      if (runs.length === 0) {
        setStatus('Inga giltiga rundor hittades att importera.');
        // Rensa localStorage eftersom inga rundor finns
        localStorage.setItem('geoquest:local:createdRuns', JSON.stringify([]));
        setTimeout(() => onComplete(true), 1500);
        return;
      }

      // Uppdatera varje runda med användarens ID
      let successCount = 0;
      let failCount = 0;

      for (const run of runs) {
        try {
          await runRepository.updateRun(run.id, {
            createdBy: currentUser.id,
            createdByName: currentUser.name || currentUser.email || 'Användare'
          });
          successCount++;
        } catch (error) {
          console.error('[LocalRunsImport] Kunde inte uppdatera runda:', run.id, error);
          failCount++;
        }
      }

      // Rensa localStorage efter lyckad import
      if (successCount > 0) {
        localStorage.setItem('geoquest:local:createdRuns', JSON.stringify([]));
      }

      // Visa resultat
      if (failCount === 0) {
        setStatus(`${successCount} rundor importerades! 🎉`);
      } else {
        setStatus(`${successCount} rundor importerades, ${failCount} misslyckades.`);
      }

      setTimeout(() => onComplete(true), 2000);
    } catch (error) {
      console.error('[LocalRunsImport] Import misslyckades:', error);
      setStatus('Import misslyckades. Försök igen senare.');
      setTimeout(() => onComplete(false), 3000);
    } finally {
      setIsImporting(false);
    }
  };

  const handleSkip = () => {
    onComplete(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg border border-slate-600 max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-white mb-4">
          Importera dina rundor
        </h2>

        {status ? (
          <div className="mb-4">
            <p className="text-gray-300">{status}</p>
          </div>
        ) : (
          <>
            <p className="text-gray-300 mb-2">
              Du har <span className="font-bold text-cyan-300">{localRunCount}</span> runda
              {localRunCount !== 1 ? 'r' : ''} som skapades innan du loggade in.
            </p>
            <p className="text-gray-300 mb-6">
              Vill du koppla dessa till ditt konto?
            </p>
          </>
        )}

        {!status && (
          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:text-gray-400 px-4 py-3 rounded font-medium text-white transition-colors"
            >
              {isImporting ? 'Importerar...' : 'Ja, importera'}
            </button>
            <button
              onClick={handleSkip}
              disabled={isImporting}
              className="flex-1 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-700 disabled:text-gray-400 px-4 py-3 rounded font-medium text-white transition-colors"
            >
              Hoppa över
            </button>
          </div>
        )}

        {status && (
          <p className="text-sm text-gray-500 mt-4">
            Stänger automatiskt...
          </p>
        )}
      </div>
    </div>
  );
};

export default LocalRunsImportDialog;