/**
 * Firestore Cache Management Utilities
 * För att hantera och optimera Firestore-cachning
 */

// Rensa utgången cache från localStorage
export const clearExpiredCache = () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('firestore-cache-')) {
            keys.push(key);
        }
    }

    let clearedCount = 0;
    keys.forEach(key => {
        try {
            const cached = JSON.parse(localStorage.getItem(key));
            if (cached && cached.expiresAt && Date.now() > cached.expiresAt) {
                localStorage.removeItem(key);
                clearedCount++;
            }
        } catch (e) {
            // Remove invalid cache entries
            localStorage.removeItem(key);
            clearedCount++;
        }
    });

    console.log(`Cleared ${clearedCount} expired cache entries`);
    return clearedCount;
};

// Rensa all cache för ett specifikt spel
export const clearGameCache = (gameId) => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
            key.includes(`games/${gameId}`) ||
            key.includes(`team-`) ||
            key.startsWith('firestore-cache-')
        )) {
            keys.push(key);
        }
    }

    keys.forEach(key => localStorage.removeItem(key));
    console.log(`Cleared cache for game ${gameId}: ${keys.length} entries`);
};

// Få cache-statistik
export const getCacheStats = () => {
    let totalEntries = 0;
    let expiredEntries = 0;
    let totalSize = 0;

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('firestore-cache-')) {
            totalEntries++;
            const value = localStorage.getItem(key);
            if (value) {
                totalSize += value.length;
                try {
                    const cached = JSON.parse(value);
                    if (cached.expiresAt && Date.now() > cached.expiresAt) {
                        expiredEntries++;
                    }
                } catch (e) {
                    expiredEntries++; // Invalid entries count as expired
                }
            }
        }
    }

    return {
        totalEntries,
        expiredEntries,
        activeEntries: totalEntries - expiredEntries,
        totalSize: Math.round(totalSize / 1024) + ' KB'
    };
};

// Auto-rensning som kan köras vid app-start
export const initCacheCleanup = () => {
    // Rensa utgången cache vid start
    clearExpiredCache();

    // Sätt upp automatisk rensning var 10:e minut
    setInterval(() => {
        clearExpiredCache();
    }, 10 * 60 * 1000);
};