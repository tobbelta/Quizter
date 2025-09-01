import React from 'react';
import { useDebug } from '../../context/DebugContext';

const DebugLogDisplay = () => {
  // **KORRIGERING:** Lägger till en fallback för 'logs' ifall den är undefined.
  // Detta förhindrar kraschen och gör komponenten mer robust.
  const { logs = [] } = useDebug() || {};

  return (
    <div className="bg-black bg-opacity-70 text-white p-4 rounded-lg h-32 overflow-y-auto w-full">
      <h4 className="font-bold text-accent-yellow mb-2 border-b border-gray-600">Debug Log</h4>
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
