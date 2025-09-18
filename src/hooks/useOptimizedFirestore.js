import { useState, useEffect, useRef } from 'react';
import { onSnapshot } from 'firebase/firestore';

/**
 * Optimized Firestore hook for mobile networks
 * Features:
 * - Debounced updates to reduce re-renders
 * - Memory-based caching
 * - Connection status awareness
 * - Automatic retry with exponential backoff
 */
export const useOptimizedFirestore = (query, debounceMs = 300) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    const cacheRef = useRef(new Map());
    const debounceRef = useRef(null);
    const unsubscribeRef = useRef(null);
    const retryCountRef = useRef(0);

    // Monitor online status
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        if (!query) {
            setLoading(false);
            return;
        }

        const setupSubscription = () => {
            try {
                unsubscribeRef.current = onSnapshot(
                    query,
                    {
                        // Use cache first for better performance on mobile
                        source: isOnline ? 'default' : 'cache'
                    },
                    (snapshot) => {
                        // Debounce rapid updates
                        if (debounceRef.current) {
                            clearTimeout(debounceRef.current);
                        }

                        debounceRef.current = setTimeout(() => {
                            const newData = snapshot.docs.map(doc => ({
                                id: doc.id,
                                ...doc.data()
                            }));

                            // Simple cache key based on query path
                            const cacheKey = query.path || 'default';
                            cacheRef.current.set(cacheKey, newData);

                            setData(newData);
                            setLoading(false);
                            setError(null);
                            retryCountRef.current = 0; // Reset retry count on success
                        }, debounceMs);
                    },
                    (err) => {
                        console.error('Firestore error:', err);

                        // Try to use cached data if available
                        const cacheKey = query.path || 'default';
                        const cachedData = cacheRef.current.get(cacheKey);

                        if (cachedData) {
                            setData(cachedData);
                            setError({ ...err, usingCache: true });
                        } else {
                            setError(err);
                        }

                        setLoading(false);

                        // Implement exponential backoff for retries
                        const retryDelay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
                        retryCountRef.current++;

                        if (retryCountRef.current <= 3 && isOnline) {
                            setTimeout(setupSubscription, retryDelay);
                        }
                    }
                );
            } catch (err) {
                console.error('Failed to setup Firestore subscription:', err);
                setError(err);
                setLoading(false);
            }
        };

        // Initial setup or retry when coming back online
        if (isOnline || retryCountRef.current === 0) {
            setupSubscription();
        }

        return () => {
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
            }
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [query, debounceMs, isOnline]);

    return {
        data,
        loading,
        error,
        isOnline,
        isUsingCache: error?.usingCache || false
    };
};

/**
 * Simple hook for batch fetching related data
 * Reduces number of Firebase requests
 */
export const useBatchFirestore = (queries) => {
    const [data, setData] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!queries || Object.keys(queries).length === 0) {
            setLoading(false);
            return;
        }

        const unsubscribes = [];
        const results = {};
        let completedQueries = 0;
        const totalQueries = Object.keys(queries).length;

        Object.entries(queries).forEach(([key, query]) => {
            if (!query) {
                completedQueries++;
                if (completedQueries === totalQueries) {
                    setData(results);
                    setLoading(false);
                }
                return;
            }

            const unsubscribe = onSnapshot(
                query,
                (snapshot) => {
                    results[key] = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));

                    completedQueries++;
                    if (completedQueries === totalQueries) {
                        setData(results);
                        setLoading(false);
                        setError(null);
                    }
                },
                (err) => {
                    console.error(`Firestore error for ${key}:`, err);
                    setError(err);
                    setLoading(false);
                }
            );

            unsubscribes.push(unsubscribe);
        });

        return () => {
            unsubscribes.forEach(unsubscribe => unsubscribe());
        };
    }, [queries]);

    return { data, loading, error };
};