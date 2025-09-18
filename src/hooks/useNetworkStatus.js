import { useState, useEffect, useCallback } from 'react';

/**
 * Hook för att hantera nätverksstatus och anpassa beteende efter anslutning
 * Optimerat för mobila nätverk med variabel kvalitet
 */
export const useNetworkStatus = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [connectionType, setConnectionType] = useState('unknown');
    const [effectiveType, setEffectiveType] = useState('4g');
    const [downlink, setDownlink] = useState(10);
    const [saveData, setSaveData] = useState(false);

    const updateConnectionInfo = useCallback(() => {
        if ('connection' in navigator || 'mozConnection' in navigator || 'webkitConnection' in navigator) {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

            setConnectionType(connection.type || 'unknown');
            setEffectiveType(connection.effectiveType || '4g');
            setDownlink(connection.downlink || 10);
            setSaveData(connection.saveData || false);
        }
    }, []);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            updateConnectionInfo();
        };

        const handleOffline = () => {
            setIsOnline(false);
        };

        const handleConnectionChange = () => {
            updateConnectionInfo();
        };

        // Initial check
        updateConnectionInfo();

        // Event listeners
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        if ('connection' in navigator) {
            navigator.connection.addEventListener('change', handleConnectionChange);
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);

            if ('connection' in navigator) {
                navigator.connection.removeEventListener('change', handleConnectionChange);
            }
        };
    }, [updateConnectionInfo]);

    // Determined based on connection quality
    const isSlowConnection = effectiveType === 'slow-2g' || effectiveType === '2g' || downlink < 1.5;
    const isFastConnection = effectiveType === '4g' && downlink > 5;

    return {
        isOnline,
        connectionType,
        effectiveType,
        downlink,
        saveData,
        isSlowConnection,
        isFastConnection,
        shouldReduceData: saveData || isSlowConnection,
        shouldOptimizeImages: saveData || isSlowConnection,
        shouldDisableAnimations: saveData || isSlowConnection
    };
};

/**
 * Hook för adaptiv låtsning baserat på nätverksstatus
 */
export const useAdaptiveLoading = () => {
    const networkStatus = useNetworkStatus();

    const getLoadingStrategy = useCallback((type) => {
        const { isSlowConnection, saveData, isOnline } = networkStatus;

        if (!isOnline) {
            return {
                showSkeleton: true,
                timeout: 30000,
                retries: 0,
                cacheFirst: true
            };
        }

        if (saveData || isSlowConnection) {
            return {
                showSkeleton: true,
                timeout: 15000,
                retries: 2,
                cacheFirst: true,
                reducedQuality: true
            };
        }

        return {
            showSkeleton: type === 'heavy',
            timeout: 8000,
            retries: 3,
            cacheFirst: false,
            reducedQuality: false
        };
    }, [networkStatus]);

    return {
        ...networkStatus,
        getLoadingStrategy
    };
};

/**
 * Hook för battery status (om tillgänglig)
 */
export const useBatteryStatus = () => {
    const [batteryLevel, setBatteryLevel] = useState(1);
    const [isCharging, setIsCharging] = useState(true);
    const [isLowBattery, setIsLowBattery] = useState(false);

    useEffect(() => {
        if ('getBattery' in navigator) {
            navigator.getBattery().then((battery) => {
                const updateBatteryInfo = () => {
                    setBatteryLevel(battery.level);
                    setIsCharging(battery.charging);
                    setIsLowBattery(battery.level < 0.2);
                };

                updateBatteryInfo();

                battery.addEventListener('levelchange', updateBatteryInfo);
                battery.addEventListener('chargingchange', updateBatteryInfo);

                return () => {
                    battery.removeEventListener('levelchange', updateBatteryInfo);
                    battery.removeEventListener('chargingchange', updateBatteryInfo);
                };
            });
        }
    }, []);

    return {
        batteryLevel,
        isCharging,
        isLowBattery,
        shouldReducePerformance: isLowBattery && !isCharging
    };
};