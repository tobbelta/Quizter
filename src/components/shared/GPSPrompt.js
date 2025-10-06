/**
 * GPS-aktiverings prompt som visas när GPS är avstängd
 * Diskret men tydlig uppmaning att aktivera GPS
 */
import React, { useState, useEffect } from 'react';
import useRunLocation from '../../hooks/useRunLocation';

const GPSPrompt = ({ className = '' }) => {
  const { trackingEnabled, status, enableTracking } = useRunLocation();
  const [dismissed, setDismissed] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Visa prompt efter 2 sekunder om GPS fortfarande är avstängt
    const timer = setTimeout(() => {
      if (!trackingEnabled && !dismissed) {
        setShowPrompt(true);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [trackingEnabled, dismissed]);

  // Dölj om GPS är påslagen eller användaren stängt dialogen
  if (trackingEnabled || dismissed || !showPrompt) {
    return null;
  }

  const handleEnable = () => {
    enableTracking();
    setDismissed(true);
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  return (
    <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-40 max-w-sm mx-4 animate-slide-up ${className}`}>
      <div className="bg-slate-800/95 backdrop-blur-sm border-2 border-cyan-500/50 rounded-xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 text-2xl">📍</div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-cyan-200 mb-1">
              Aktivera GPS för bästa upplevelse
            </h3>
            <p className="text-xs text-gray-300 mb-3">
              RouteQuest fungerar bäst med GPS aktiverat. Du kan också använda appen manuellt.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleEnable}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold px-3 py-2 rounded-lg text-sm transition-colors"
              >
                Aktivera GPS
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-2 text-gray-400 hover:text-gray-200 text-sm transition-colors"
              >
                Stäng
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GPSPrompt;
