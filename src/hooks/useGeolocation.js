import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebug } from '../context/DebugContext';

// --- Constants ---
const KALMAR_DEFAULT_LOCATION = { latitude: 56.66311, longitude: 16.36039 }; // Nygatan 13a, Kalmar

// --- Helper Functions ---
const getTargetCoordinates = (target) => {
    if (!target) return null;
    const lat = target.latitude || target.lat;
    const lng = target.longitude || target.lng;
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
                const { minLat, maxLat, minLng, maxLng } = course.bounds;
                nextTarget = {
                    latitude: Math.random() * (maxLat - minLat) + minLat,
                    longitude: Math.random() * (maxLng - minLng) + minLng,
                };
                nextStage = 'MOVING_TO_RANDOM';
                nextDescription = 'Gå till start';
                break;
            
            case 'AT_RANDOM_POINT':
                nextTarget = getTargetCoordinates(startPoint);
                nextStage = 'MOVING_TO_START';
                nextDescription = 'Gå till första hindret';
                break;
            
            case 'AT_START':
            case 'AT_OBSTACLE':
                const activeObstacleId = game.activeObstacleId;
                if (!activeObstacleId) {
                    nextTarget = getTargetCoordinates(finishPoint);
                    nextStage = 'MOVING_TO_FINISH';
                    nextDescription = 'Avsluta spelet';
                } else {
                    const activeObstacle = course.obstacles.find(o => o.obstacleId === activeObstacleId);
                    nextTarget = getTargetCoordinates(activeObstacle);
                    nextStage = 'MOVING_TO_OBSTACLE';
                    const currentIndex = course.obstacles.findIndex(o => o.obstacleId === activeObstacleId);
                    nextDescription = `Gå till hinder ${currentIndex + 2}`;
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
            setSimulationState({ stage: nextStage, description: nextDescription });
        }
    }, [game, simulationState.stage, position, simulationSpeed]); // Lade till simulationState.stage här
    
    useEffect(() => {
        if (!isDebug || !animationRef.current.target) {
            return;
        }

        const animate = (timestamp) => {
            const anim = animationRef.current;
            if (!anim.startTime) return;
            
            const elapsedTime = timestamp - anim.startTime;
            const progress = Math.min(elapsedTime / anim.duration, 1);

            const nextLatitude = lerp(anim.startPos.latitude, anim.target.latitude, progress);
            const nextLongitude = lerp(anim.startPos.longitude, anim.target.longitude, progress);
            setPosition({ coords: { latitude: nextLatitude, longitude: nextLongitude } });

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(animate);
            } else {
                animationRef.current.target = null;
                let finalStage = 'FINISHED';
                if (simulationState.stage === 'MOVING_TO_RANDOM') finalStage = 'AT_RANDOM_POINT';
                if (simulationState.stage === 'MOVING_TO_START') finalStage = 'AT_START';
                if (simulationState.stage === 'MOVING_TO_OBSTACLE') finalStage = 'AT_OBSTACLE';
                if (simulationState.stage === 'MOVING_TO_FINISH') finalStage = 'AT_FINISH';
                setSimulationState(prevState => ({ ...prevState, stage: finalStage }));
            }
        };

        frameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameRef.current);
    // **KORRIGERING:** Lade till 'simulationState.stage' som dependency för att lösa varningen.
    }, [isDebug, animationRef.current.target, simulationState.stage]);


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
        const watcher = navigator.geolocation.watchPosition(
            setPosition,
            setError,
            options
        );
        return () => navigator.geolocation.clearWatch(watcher);
    }, [isDebug, paused, options, position]); // Lade till position här för att undvika att den sätts om

    return { position, error, advanceSimulation, simulationState };
};

export default useGeolocation;

