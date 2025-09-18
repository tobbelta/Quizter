import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebug } from '../context/DebugContext';

// --- Constants ---
const KALMAR_DEFAULT_LOCATION = { latitude: 56.66311, longitude: 16.36039 }; // Nygatan 13a, Kalmar

// --- Helper Functions ---
const getTargetCoordinates = (target) => {
    if (!target) return null;
    // Hantera olika koordinatstrukturer
    const lat = target.latitude || target.position?.lat || target.lat;
    const lng = target.longitude || target.position?.lng || target.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return { latitude: lat, longitude: lng };
};

// Linear interpolation for smooth movement
const lerp = (start, end, t) => start * (1 - t) + end * t;

export const useGeolocation = (options, isDebug, game, paused = false) => {
    const { simulationSpeed } = useDebug();
    const [position, setPosition] = useState(null);
    const [error, setError] = useState(null);
    const [simulationState, setSimulationState] = useState({ stage: 'IDLE', description: 'Starta simulering' });

    const animationRef = useRef({ target: null, startPos: null, startTime: null, duration: 0 });
    const frameRef = useRef();

    const advanceSimulation = useCallback(() => {
        const course = game?.course;
        if (!course) return;

        let nextTarget = null;
        let nextStage = simulationState.stage;
        let nextDescription = 'Simulering avslutad';

        const startPoint = course.startPoint || course.start;
        const finishPoint = course.finishPoint || course.finish;

        switch (simulationState.stage) {
            case 'IDLE':
                // Calculate bounds from start/finish points if course.bounds doesn't exist
                let bounds;
                if (course.bounds) {
                    bounds = course.bounds;
                } else if (startPoint && finishPoint) {
                    // Create bounds from start and finish points
                    const startLat = startPoint.latitude || startPoint.lat;
                    const startLng = startPoint.longitude || startPoint.lng;
                    const finishLat = finishPoint.latitude || finishPoint.lat;
                    const finishLng = finishPoint.longitude || finishPoint.lng;

                    if (typeof startLat === 'number' && typeof startLng === 'number' &&
                        typeof finishLat === 'number' && typeof finishLng === 'number') {
                        bounds = {
                            minLat: Math.min(startLat, finishLat) - 0.01,
                            maxLat: Math.max(startLat, finishLat) + 0.01,
                            minLng: Math.min(startLng, finishLng) - 0.01,
                            maxLng: Math.max(startLng, finishLng) + 0.01,
                        };
                    } else {
                        bounds = null;
                    }
                }

                if (!bounds) {
                    // Fallback to Kalmar area if no bounds or points available
                    bounds = {
                        minLat: 56.65,
                        maxLat: 56.67,
                        minLng: 16.35,
                        maxLng: 16.37,
                    };
                }

                nextTarget = {
                    latitude: Math.random() * (bounds.maxLat - bounds.minLat) + bounds.minLat,
                    longitude: Math.random() * (bounds.maxLng - bounds.minLng) + bounds.minLng,
                };
                nextStage = 'MOVING_TO_RANDOM';
                nextDescription = 'Gå till start';
                break;

            case 'AT_RANDOM_POINT':
                nextTarget = getTargetCoordinates(startPoint);
                nextStage = 'MOVING_TO_START';
                nextDescription = 'Gå till start';
                break;

            case 'AT_START':
            case 'AT_OBSTACLE':
                const activeObstacleId = game.activeObstacleId;
                if (!activeObstacleId) {
                    nextTarget = getTargetCoordinates(finishPoint);
                    nextStage = 'MOVING_TO_FINISH';
                    nextDescription = 'Gå till mål';
                } else {
                    const activeObstacle = course.obstacles?.find(o => o.obstacleId === activeObstacleId);
                    if (activeObstacle) {
                        nextTarget = getTargetCoordinates(activeObstacle);
                        nextStage = 'MOVING_TO_OBSTACLE';
                        const currentIndex = course.obstacles?.findIndex(o => o.obstacleId === activeObstacleId) || 0;
                        const hinderNames = ['första', 'andra', 'tredje', 'fjärde', 'femte', 'sjätte', 'sjunde', 'åttonde', 'nionde', 'tionde'];
                        const hinderName = hinderNames[currentIndex] || `${currentIndex + 1}:e`;
                        nextDescription = `Gå till ${hinderName} hindret`;
                    } else {
                        // Om aktivt hinder inte hittas, gå till målet
                        nextTarget = getTargetCoordinates(finishPoint);
                        nextStage = 'MOVING_TO_FINISH';
                        nextDescription = 'Gå till mål';
                    }
                }
                break;
            
            default:
                break;
        }

        if (nextTarget) {
            const currentPos = position?.coords || KALMAR_DEFAULT_LOCATION;
            const speedFactor = simulationSpeed === 'fast' ? 0.5 : simulationSpeed === 'slow' ? 2.5 : 1;
            const distance = Math.sqrt(Math.pow(nextTarget.latitude - currentPos.latitude, 2) + Math.pow(nextTarget.longitude - currentPos.longitude, 2));
            const duration = (distance * 40000) * speedFactor;

            animationRef.current = {
                target: nextTarget,
                startPos: currentPos,
                startTime: performance.now(),
                duration: Math.max(1000, duration),
            };

            // Set animation target to trigger useEffect
            setAnimationTarget(nextTarget);
            setSimulationState({ stage: nextStage, description: nextDescription });

            console.log(`Starting animation: ${simulationState.stage} -> ${nextStage}, target:`, nextTarget);
        }
    }, [game, simulationState.stage, position, simulationSpeed]); // Lade till simulationState.stage här

    // Uppdatera simuleringsstatusen när spelet ändras
    useEffect(() => {
        if (!isDebug || !game) return;

        // När alla hinder är klarade -> gå till mål
        if (!game.activeObstacleId && game.completedObstacles?.length > 0 && simulationState.stage === 'AT_OBSTACLE' && simulationState.description.startsWith('Vid ')) {
            setSimulationState({ stage: 'AT_OBSTACLE', description: 'Gå till mål' });
        }

        // När nästa hinder aktiveras efter gåta -> uppdatera till "Gå till X hindret"
        if (game.activeObstacleId && simulationState.stage === 'AT_OBSTACLE' && simulationState.description.startsWith('Vid ')) {
            const activeObstacle = game.course?.obstacles?.find(o => o.obstacleId === game.activeObstacleId);
            if (activeObstacle) {
                const currentIndex = game.course.obstacles.findIndex(o => o.obstacleId === game.activeObstacleId);
                const hinderNames = ['första', 'andra', 'tredje', 'fjärde', 'femte', 'sjätte', 'sjunde', 'åttonde', 'nionde', 'tionde'];
                const hinderName = hinderNames[currentIndex] || `${currentIndex + 1}:e`;

                // Kontrollera om det här verkligen är ett nytt hinder (inte samma som vi redan är vid)
                const expectedCurrentDescription = `Vid ${hinderName} hindret`;
                if (!simulationState.description.includes(hinderName)) {
                    // Det är ett nytt hinder -> ändra till "Gå till X hindret"
                    setSimulationState({ stage: 'AT_OBSTACLE', description: `Gå till ${hinderName} hindret` });
                }
            }
        }
    }, [game?.activeObstacleId, game?.completedObstacles, isDebug, simulationState.stage, simulationState.description, game?.course]);

    // Track animation target separately to trigger useEffect properly
    const [animationTarget, setAnimationTarget] = useState(null);
    const animationCompletedRef = useRef(false);

    useEffect(() => {
        if (!isDebug || !animationTarget) {
            return;
        }

        animationCompletedRef.current = false;

        const animate = (timestamp) => {
            const anim = animationRef.current;
            if (!anim.startTime || !anim.target) return;

            const elapsedTime = timestamp - anim.startTime;
            const progress = Math.min(elapsedTime / anim.duration, 1);

            const nextLatitude = lerp(anim.startPos.latitude, anim.target.latitude, progress);
            const nextLongitude = lerp(anim.startPos.longitude, anim.target.longitude, progress);
            setPosition({ coords: { latitude: nextLatitude, longitude: nextLongitude } });

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(animate);
            } else {
                // Förhindra dubbla kompletteringar
                if (animationCompletedRef.current) return;
                animationCompletedRef.current = true;

                // Animation completed - clear target and update state
                animationRef.current.target = null;
                setAnimationTarget(null);

                let finalStage = 'FINISHED';
                if (simulationState.stage === 'MOVING_TO_RANDOM') finalStage = 'AT_RANDOM_POINT';
                if (simulationState.stage === 'MOVING_TO_START') finalStage = 'AT_START';
                if (simulationState.stage === 'MOVING_TO_OBSTACLE') finalStage = 'AT_OBSTACLE';
                if (simulationState.stage === 'MOVING_TO_FINISH') finalStage = 'AT_FINISH';

                setSimulationState(prevState => {
                    let newDescription = prevState.description;

                    // Uppdatera beskrivning baserat på vilken stage vi når
                    if (finalStage === 'AT_START' && game?.activeObstacleId) {
                        const activeObstacle = game.course?.obstacles?.find(o => o.obstacleId === game.activeObstacleId);
                        if (activeObstacle) {
                            const currentIndex = game.course.obstacles.findIndex(o => o.obstacleId === game.activeObstacleId);
                            const hinderNames = ['första', 'andra', 'tredje', 'fjärde', 'femte', 'sjätte', 'sjunde', 'åttonde', 'nionde', 'tionde'];
                            const hinderName = hinderNames[currentIndex] || `${currentIndex + 1}:e`;
                            newDescription = `Gå till ${hinderName} hindret`;
                        }
                    } else if (finalStage === 'AT_OBSTACLE' && game?.activeObstacleId) {
                        const activeObstacle = game.course?.obstacles?.find(o => o.obstacleId === game.activeObstacleId);
                        if (activeObstacle) {
                            const currentIndex = game.course.obstacles.findIndex(o => o.obstacleId === game.activeObstacleId);
                            const hinderNames = ['första', 'andra', 'tredje', 'fjärde', 'femte', 'sjätte', 'sjunde', 'åttonde', 'nionde', 'tionde'];
                            const hinderName = hinderNames[currentIndex] || `${currentIndex + 1}:e`;
                            newDescription = `Vid ${hinderName} hindret`;
                        }
                    }

                    console.log(`Animation completed: ${prevState.stage} -> ${finalStage}, description: ${newDescription}`);
                    return { stage: finalStage, description: newDescription };
                });
            }
        };

        frameRef.current = requestAnimationFrame(animate);
        return () => {
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, [isDebug, animationTarget, simulationState.stage, game]);


    useEffect(() => {
        if (paused) return;

        if (isDebug) {
            if (!position) { // Sätt bara startpositionen en gång
                setPosition({ coords: KALMAR_DEFAULT_LOCATION });
            }
            return;
        }

        if (!('geolocation' in navigator)) {
            setError(new Error('Geolocation is not supported.'));
            return;
        }
        // Optimera för mobil - längre timeout och mindre precision när inte aktivt spelande
        const mobileOptimizedOptions = {
            ...options,
            timeout: game?.status === 'started' ? 10000 : 20000, // Längre timeout när inte aktivt spelande
            maximumAge: game?.status === 'started' ? 5000 : 15000, // Acceptera äldre positioner när inte aktivt
            enableHighAccuracy: game?.status === 'started' ? options.enableHighAccuracy : false
        };

        const watcher = navigator.geolocation.watchPosition(
            setPosition,
            setError,
            mobileOptimizedOptions
        );
        return () => navigator.geolocation.clearWatch(watcher);
    }, [isDebug, paused, options, position, game?.status]); // Lade till game.status för att optimera för spelstatus

    return { position, error, advanceSimulation, simulationState };
};

export default useGeolocation;

