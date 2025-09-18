import React from 'react';
import { useDebug } from '../../context/DebugContext';

const DebugLogDisplay = () => {
  // **KORRIGERING:** Lägger till en fallback för 'logs' ifall den är undefined.
  // Detta förhindrar kraschen och gör komponenten mer robust.
  const { logs = [], clearLogs } = useDebug() || {};

  const copyAllLogs = () => {
    const allLogsText = logs.join('\n');
    navigator.clipboard.writeText(allLogsText).then(() => {
      console.log('Alla loggar kopierade till urklipp');
    }).catch(err => {
      console.error('Kunde inte kopiera loggar:', err);
    });
  };

  const handleClearLogs = () => {
    if (clearLogs) clearLogs();
  };

  return (
    <div className="bg-black bg-opacity-70 text-white p-4 rounded-lg h-32 overflow-y-auto w-full">
      <div className="flex justify-between items-center mb-2 border-b border-gray-600 pb-1">
        <h4 className="font-bold text-accent-yellow">Debug Log</h4>
        <div className="flex gap-1">
          <button
            onClick={copyAllLogs}
            className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
            title="Kopiera alla loggar"
          >
            📋
          </button>
          <button
            onClick={handleClearLogs}
            className="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
            title="Rensa loggar"
          >
            🗑️
          </button>
        </div>
      </div>
      <div className="flex flex-col-reverse">
        {logs.map((log, i) => (
          <p key={i} className="text-xs font-mono">
            {log}
          </p>
        ))}
      </div>
    </div>
  );
};

export default DebugLogDisplay;
