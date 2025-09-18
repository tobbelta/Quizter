import React, { useState } from 'react';
import { useDebug } from '../../context/DebugContext';

const DebugSettings = () => {
  const { isDebug, setDebugMode, minimalControls, setMinimalControlsMode, showDebugInfo, setShowDebugInfoMode } = useDebug();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="absolute top-20 right-4 z-[1001]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-yellow-500 hover:bg-yellow-600 text-black p-2 rounded-full shadow-lg transition-colors duration-200"
        aria-label="Debug-inställningar"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-black bg-opacity-90 text-white p-4 rounded-lg shadow-xl border border-yellow-500 min-w-48">
          <h4 className="font-bold text-yellow-400 mb-3 border-b border-gray-600 pb-2">Debug-inställningar</h4>

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDebug}
                onChange={(e) => setDebugMode(e.target.checked)}
                className="form-checkbox h-4 w-4 text-yellow-500"
              />
              Aktivera debug-läge
            </label>

            {isDebug && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={minimalControls}
                    onChange={(e) => setMinimalControlsMode(e.target.checked)}
                    className="form-checkbox h-4 w-4 text-yellow-500"
                  />
                  Minimal styrning
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showDebugInfo}
                    onChange={(e) => setShowDebugInfoMode(e.target.checked)}
                    className="form-checkbox h-4 w-4 text-yellow-500"
                  />
                  Visa debug-loggar
                </label>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DebugSettings;