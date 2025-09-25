import { useEffect, useRef, useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Hook för att hantera spelaraktivitet baserat på browser-händelser
 *
 * Detekterar:
 * - Browser/flik stängning (beforeunload)
 * - Längre tids inaktivitet efter visibilitychange
 *
 * Ignorerar:
 * - Minimering av browser på desktop
 * - App-switching på mobil
 * - Tillfällig skärmdimning/sparläge
 */
export const usePlayerActivity = (gameId, userId, isGameActive = false) => {
    const lastVisibilityChange = useRef(Date.now());
    const inactivityTimer = useRef(null);
    const hasSetInactive = useRef(false);

    // Markera spelare som inaktiv
    const setPlayerInactive = useCallback(async (reason = 'unknown') => {
        if (!gameId || !userId || hasSetInactive.current) return;

        console.log(`🔴 Markerar spelare som inaktiv: ${reason}`);
        hasSetInactive.current = true;

        try {
            const playerRef = doc(db, 'games', gameId, 'players', userId);
            await updateDoc(playerRef, {
                isActive: false,
                lastSeen: new Date(),
                inactiveReason: reason
            });
        } catch (error) {
            console.error('Kunde inte uppdatera spelarstatus:', error);
        }
    }, [gameId, userId]);

    // Återställ spelare som aktiv
    const setPlayerActive = useCallback(async () => {
        if (!gameId || !userId) return;

        console.log('🟢 Markerar spelare som aktiv');
        hasSetInactive.current = false;

        // Rensa eventuell inaktivitetstimer
        if (inactivityTimer.current) {
            clearTimeout(inactivityTimer.current);
            inactivityTimer.current = null;
        }

        try {
            const playerRef = doc(db, 'games', gameId, 'players', userId);
            await updateDoc(playerRef, {
                isActive: true,
                lastSeen: new Date(),
                inactiveReason: null,
                isVisible: !document.hidden // Lägg till visibility status
            });
        } catch (error) {
            console.error('Kunde inte uppdatera spelarstatus:', error);
        }
    }, [gameId, userId]);

    useEffect(() => {
        // Endast aktivera om spel är aktivt
        if (!isGameActive || !gameId || !userId) {
            return;
        }

        // Sätt spelare som aktiv när hook aktiveras
        setPlayerActive();

        // 1. Hantera browser/flik stängning
        const handleBeforeUnload = (event) => {
            console.log('📤 beforeunload - sätter spelare som inaktiv');
            // Använd synkron updateDoc för att säkerställa data når Firestore
            setPlayerInactive('browser_closed');
        };

        // 2. Hantera visibility changes (minimering, app-switching, etc.)
        const handleVisibilityChange = () => {
            const now = Date.now();
            lastVisibilityChange.current = now;

            // Uppdatera visibility status omedelbart
            const updateVisibilityStatus = async () => {
                try {
                    const playerRef = doc(db, 'games', gameId, 'players', userId);
                    await updateDoc(playerRef, {
                        isVisible: !document.hidden,
                        lastSeen: new Date()
                    });
                } catch (error) {
                    console.error('Kunde inte uppdatera visibility status:', error);
                }
            };

            updateVisibilityStatus();

            if (document.hidden) {
                console.log('👁️ Sida blev dold - startar inaktivitetstimer');

                // Rensa tidigare timer
                if (inactivityTimer.current) {
                    clearTimeout(inactivityTimer.current);
                }

                // Sätt timer för att markera som inaktiv efter längre tids frånvaro
                inactivityTimer.current = setTimeout(() => {
                    const timeSinceHidden = Date.now() - lastVisibilityChange.current;

                    // Om sidan fortfarande är dold efter 3 minuter, markera som inaktiv
                    if (document.hidden && timeSinceHidden >= (3 * 60 * 1000)) {
                        setPlayerInactive('long_absence');
                    }
                }, 3 * 60 * 1000); // 3 minuter

            } else {
                console.log('👁️ Sida blev synlig - återställer aktivitet');

                // Rensa inaktivitetstimer om sidan blir synlig igen
                if (inactivityTimer.current) {
                    clearTimeout(inactivityTimer.current);
                    inactivityTimer.current = null;
                }

                // Återställ som aktiv om spelaren kommer tillbaka inom rimlig tid
                const timeSinceHidden = now - lastVisibilityChange.current;
                if (timeSinceHidden < (5 * 60 * 1000)) { // Inom 5 minuter
                    setPlayerActive();
                }
            }
        };

        // 3. Hantera fokus events (extra säkerhet)
        const handleFocus = () => {
            if (hasSetInactive.current) {
                console.log('🔍 Fokus återfick - återställer aktivitet');
                setPlayerActive();
            }
        };

        // Lägg till event listeners
        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);

        // Cleanup
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);

            if (inactivityTimer.current) {
                clearTimeout(inactivityTimer.current);
            }
        };
    }, [gameId, userId, isGameActive, setPlayerActive, setPlayerInactive]);

    return {
        setPlayerActive,
        setPlayerInactive
    };
};