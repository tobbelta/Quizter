/**
 * InstallPrompt - Uppmuntrar användare att installera PWA:n
 */
import React, { useState, useEffect } from 'react';

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Lyssna efter beforeinstallprompt-eventet
    const handleBeforeInstallPrompt = (e) => {
      // Förhindra Chrome från att visa automatisk prompt
      e.preventDefault();
      setDeferredPrompt(e);

      // Visa vår egen prompt om användaren inte installerat än
      const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
      const hasSeenPrompt = localStorage.getItem('geoquest:installPromptSeen');

      if (!isInstalled && !hasSeenPrompt) {
        // Visa efter 10 sekunder så användaren hinner bekanta sig
        setTimeout(() => setShowPrompt(true), 10000);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Kontrollera om redan installerad
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowPrompt(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Visa native install prompt
    deferredPrompt.prompt();

    // Vänta på användarens val
    await deferredPrompt.userChoice;

    // Rensa prompt
    setDeferredPrompt(null);
    setShowPrompt(false);
    localStorage.setItem('geoquest:installPromptSeen', 'true');
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('geoquest:installPromptSeen', 'true');
  };

  // iOS-specifik instruktion
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

  if (isIOS && !isStandalone && showPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up">
        <div className="bg-slate-900 rounded-xl shadow-2xl p-4 border border-purple-500/40">
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 text-white/80 hover:text-white"
            aria-label="Stäng"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          <div className="flex items-start gap-3 pr-6">
            <div className="flex-shrink-0">
              <img src="/logo-compass.svg" alt="RouteQuest" className="w-12 h-12" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-bold text-lg mb-1">Installera RouteQuest!</h3>
              <p className="text-gray-300 text-sm mb-2">
                Få snabb åtkomst till tipspromenader direkt från din hemskärm.
              </p>
              <div className="bg-slate-800 rounded-lg p-3 text-gray-300 text-xs space-y-1">
                <p>1. Tryck på <strong className="text-white">Dela</strong>-knappen nedan</p>
                <p>2. Välj <strong className="text-white">"Lägg till på hemskärmen"</strong></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!showPrompt || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up">
      <div className="bg-slate-900 rounded-xl shadow-2xl p-4 border border-purple-500/40">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-white/80 hover:text-white"
          aria-label="Stäng"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="flex-shrink-0">
            <img src="/logo-compass.svg" alt="RouteQuest" className="w-12 h-12" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-bold text-lg mb-1">Installera RouteQuest!</h3>
            <p className="text-gray-300 text-sm mb-3">
              Få snabb åtkomst till tipspromenader direkt från din hemskärm. Fungerar offline!
            </p>
            <button
              onClick={handleInstallClick}
              className="w-full bg-purple-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-400 transition-colors"
            >
              📲 Installera nu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;
