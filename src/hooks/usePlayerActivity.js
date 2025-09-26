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
    const visibilityUpdateTimer = useRef(null);

    // FÖRBÄTTRAD ANTI-LOOP: Per-reason throttling
    const lastToggleByReason = useRef({});
    const isProcessingChange = useRef(false); // Global lock

    // Markera spelare som inaktiv
    const setPlayerInactive = useCallback(async (reason = 'unknown') => {
        if (!gameId || !userId || hasSetInactive.current) return;

        // FÖRBÄTTRAD ANTI-LOOP: Global processing lock + per-reason throttle
        if (isProcessingChange.current) {
            console.log(`🚫 Processing lock: Skippar inactivity (${reason})`);
            return;
        }

        const now = Date.now();
        const lastToggleForReason = lastToggleByReason.current[reason] || 0;
        if (now - lastToggleForReason < 1000) { // REDUCERAT: 1 sekund per reason
            console.log(`🚫 Reason throttle: Skippar inactivity ${reason} (${Math.round((now - lastToggleForReason)/1000)}s sedan)`);
            return;
        }

        isProcessingChange.current = true;
        lastToggleByReason.current[reason] = now;

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
        } finally {
            // Släpp processing lock snabbare - 200ms
            setTimeout(() => {
                isProcessingChange.current = false;
            }, 200);
        }
    }, [gameId, userId]);

    // Återställ spelare som aktiv
    const setPlayerActive = useCallback(async () => {
        if (!gameId || !userId) return;

        // FÖRBÄTTRAD ANTI-LOOP för active
        if (isProcessingChange.current) {
            console.log(`🚫 Processing lock: Skippar activity toggle`);
            return;
        }
        if (!hasSetInactive.current) {
            // Redan aktiv, skippa tyst
            return;
        }

        const now = Date.now();
        const lastActiveToggle = lastToggleByReason.current['activation'] || 0;
        if (now - lastActiveToggle < 500) { // REDUCERAT: 0.5 sekunder för aktivering
            console.log(`🚫 Activation throttle: Skippar activity toggle (${Math.round((now - lastActiveToggle)/1000)}s sedan)`);
            return;
        }

        isProcessingChange.current = true;
        lastToggleByReason.current['activation'] = now;

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
        } finally {
            // Släpp processing lock snabbare - 200ms
            setTimeout(() => {
                isProcessingChange.current = false;
            }, 200);
        }
    }, [gameId, userId]);

    useEffect(() => {
        // Endast aktivera om spel är aktivt
        if (!isGameActive || !gameId || !userId) {
            return;
        }

        // Sätt spelare som aktiv när hook aktiveras
        setPlayerActive();

        // 1. Hantera browser/flik stängning - FÖRBÄTTRAD FIX
        const handleBeforeUnload = (event) => {
            console.log('📤 beforeunload - sätter spelare som inaktiv');

            // Markera som inaktiv omedelbart utan await
            if (!hasSetInactive.current) {
                hasSetInactive.current = true;

                // Använd updateDoc utan await för snabbast möjliga exekvering
                const playerRef = doc(db, 'games', gameId, 'players', userId);
                updateDoc(playerRef, {
                    isActive: false,
                    lastSeen: new Date(),
                    inactiveReason: 'browser_closed'
                }).catch(err => {
                    console.error('beforeunload updateDoc misslyckades:', err);
                });
            }
        };

        // 2. Hantera visibility changes (minimering, app-switching, etc.)
        const handleVisibilityChange = () => {
            const now = Date.now();
            lastVisibilityChange.current = now;

            // FIX: Använd rätt scope för visibility timer
            const updateVisibilityStatus = () => {
                if (visibilityUpdateTimer.current) {
                    clearTimeout(visibilityUpdateTimer.current);
                }

                // Vänta 2 sekunder innan uppdatering för att undvika spam
                visibilityUpdateTimer.current = setTimeout(async () => {
                    try {
                        const playerRef = doc(db, 'games', gameId, 'players', userId);
                        await updateDoc(playerRef, {
                            isVisible: !document.hidden,
                            lastSeen: new Date()
                        });
                    } catch (error) {
                        console.error('Kunde inte uppdatera visibility status:', error);
                    }
                    visibilityUpdateTimer.current = null; // Rensa efter exekvering
                }, 2000); // 2 sekunders debounce
            };

            updateVisibilityStatus();

            if (document.hidden) {
                console.log('👁️ Sida blev dold - startar inaktivitetstimer');

                // Rensa tidigare timer
                if (inactivityTimer.current) {
                    clearTimeout(inactivityTimer.current);
                }

                // OPTIMERING: Öka timeout för att minska Firestore-uppdateringar
                // Sätt timer för att markera som inaktiv efter längre tids frånvaro
                inactivityTimer.current = setTimeout(() => {
                    const timeSinceHidden = Date.now() - lastVisibilityChange.current;

                    // Om sidan fortfarande är dold efter 10 minuter, markera som inaktiv
                    if (document.hidden && timeSinceHidden >= (10 * 60 * 1000)) {
                        setPlayerInactive('long_absence');
                    }
                }, 10 * 60 * 1000); // 10 minuter istället för 3

            } else {
                console.log('👁️ Sida blev synlig - återställer aktivitet');

                // Rensa inaktivitetstimer om sidan blir synlig igen
                if (inactivityTimer.current) {
                    clearTimeout(inactivityTimer.current);
                    inactivityTimer.current = null;
                }

                // OPTIMERING: Utöka tidsramen för återaktivering
                // Återställ som aktiv om spelaren kommer tillbaka inom rimlig tid
                const timeSinceHidden = now - lastVisibilityChange.current;
                if (timeSinceHidden < (15 * 60 * 1000)) { // Inom 15 minuter istället för 5
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
            if (visibilityUpdateTimer.current) {
                clearTimeout(visibilityUpdateTimer.current);
            }
        };
    }, [gameId, userId, isGameActive, setPlayerActive, setPlayerInactive]);

    return {
        setPlayerActive,
        setPlayerInactive
    };
};