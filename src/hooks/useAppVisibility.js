import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * Spårar om appen är i förgrunden både på webben och i native shell.
 * Faller tillbaka till document.visibilityState när App-pluginen saknas.
 */
const useAppVisibility = () => {
  const [isForeground, setIsForeground] = useState(() => {
    if (typeof document === 'undefined') {
      return true;
    }
    return document.visibilityState !== 'hidden';
  });

  useEffect(() => {
    const handleVisibility = () => {
      setIsForeground(document.visibilityState !== 'hidden');
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    let appListener;
    const appPluginAvailable =
      Capacitor.isNativePlatform() &&
      App &&
      typeof App.getState === 'function' &&
      typeof App.addListener === 'function';

    if (appPluginAvailable) {
      App.getState()
        .then(({ isActive }) => setIsForeground(isActive))
        .catch(() => {
          // Ignorera - fall tillbaka till document visibility
        });

      appListener = App.addListener('appStateChange', ({ isActive }) => {
        setIsForeground(isActive);
      });
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      if (appListener && typeof appListener.remove === 'function') {
        appListener.remove();
      }
    };
  }, []);

  return isForeground;
};

export default useAppVisibility;

