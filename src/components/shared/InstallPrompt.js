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
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }

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
        <div className="bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl shadow-2xl p-4 border-2 border-white/20">
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
            <div className="flex-shrink-0 bg-white rounded-lg p-2">
              <svg className="w-8 h-8 text-cyan-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-white font-bold text-lg mb-1">Installera RouteQuest!</h3>
              <p className="text-white/90 text-sm mb-2">
                Få snabb åtkomst till tipspromenader direkt från din hemskärm.
              </p>
              <div className="bg-white/10 rounded-lg p-3 text-white/90 text-xs space-y-1">
                <p>📱 Tryck på <strong>Dela</strong>-knappen nedan</p>
                <p>➕ Välj <strong>"Lägg till på hemskärmen"</strong></p>
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
      <div className="bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl shadow-2xl p-4 border-2 border-white/20">
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
          <div className="flex-shrink-0 bg-white rounded-lg p-2">
            <svg className="w-8 h-8 text-cyan-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-white font-bold text-lg mb-1">Installera RouteQuest!</h3>
            <p className="text-white/90 text-sm mb-3">
              Få snabb åtkomst till tipspromenader direkt från din hemskärm. Fungerar offline!
            </p>
            <button
              onClick={handleInstallClick}
              className="w-full bg-white text-cyan-600 font-bold py-2 px-4 rounded-lg hover:bg-gray-100 transition-colors"
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
