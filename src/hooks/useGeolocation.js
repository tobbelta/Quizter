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

export const useGeolocation = (options, isDebug, game, paused = false, userId = null, teamMembers = null) => {
    const { simulationSpeed } = useDebug();
    const [position, setPosition] = useState(null);
    const [error, setError] = useState(null);
    const [simulationState, setSimulationState] = useState({ stage: 'IDLE', description: 'Starta simulering' });
    const permissionDenied = useRef(false);

    const animationRef = useRef({ target: null, startPos: null, startTime: null, duration: 0 });
    const frameRef = useRef();

    // Hjälpfunktion för att beräkna rätt activeObstacleId baserat på aktiva spelare
    const getValidActiveObstacleId = useCallback(() => {
        // För late-joining spelare: använd alltid game.activeObstacleId om teamMembers inte är laddat än
        if (!game) return null;

        if (!teamMembers || teamMembers.length === 0 || !game.completedObstaclesDetailed || game.completedObstaclesDetailed.length === 0) {
            return game?.activeObstacleId;
        }

        // För varje hinder, kolla om det finns minst en giltig lösning av någon som är aktiv nu
        const allObstacles = game.course?.obstacles || [];
        const validObstacles = [];

        for (const obstacle of allObstacles) {
            // Hitta alla lösningar för detta hinder
            const solutionsForObstacle = game.completedObstaclesDetailed.filter(
                completed => completed.obstacleId === obstacle.obstacleId
            );

            // Kolla om det finns minst en giltig lösning av någon som är aktiv nu
            const hasValidSolution = solutionsForObstacle.some(completed => {
                const solver = teamMembers.find(member => member.uid === completed.solvedBy);
                const wasActiveWhenSolved = completed.solverWasActive !== false;
                const isActiveNow = solver && solver.isActive === true;
                return wasActiveWhenSolved && isActiveNow;
            });

            if (hasValidSolution) {
                // Använd den senaste GILTIGA lösningen för detta hinder
                const validSolutions = solutionsForObstacle.filter(completed => {
                    const solver = teamMembers.find(member => member.uid === completed.solvedBy);
                    const wasActiveWhenSolved = completed.solverWasActive !== false;
                    const isActiveNow = solver && solver.isActive === true;
                    return wasActiveWhenSolved && isActiveNow;
                });
                const latestValidSolution = validSolutions
                    .sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt))[0];
                validObstacles.push(latestValidSolution);
            }
        }

        // Hitta vilket hinder som ska vara aktivt (första hindret som inte är giltigt löst)
        const validObstacleIds = validObstacles.map(o => o.obstacleId);

        for (let i = 0; i < allObstacles.length; i++) {
            const obstacleId = allObstacles[i].obstacleId;
            if (!validObstacleIds.includes(obstacleId)) {
                return obstacleId;
            }
        }
        return null; // Alla hinder är lösta
    }, [game, teamMembers]);

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
                // Om det är första gången, gå till en slumpmässig punkt först
                if (!position) {
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
                } else {
                    // Vi har redan en position, gå direkt till start
                    nextTarget = getTargetCoordinates(startPoint);
                    nextStage = 'MOVING_TO_START';
                    nextDescription = 'Gå till start';
                }
                break;

            case 'AT_RANDOM_POINT':
                nextTarget = getTargetCoordinates(startPoint);
                nextStage = 'MOVING_TO_START';
                nextDescription = 'Gå till start';
                break;

            case 'AT_START':
            case 'AT_OBSTACLE':
                // Kontrollera att spelet har startat innan vi går till hinder
                if (game.status !== 'started') {
                    nextDescription = 'Väntar på att spelet startar';
                    nextStage = 'AT_START';
                    break;
                }

                const activeObstacleId = getValidActiveObstacleId();

                if (!activeObstacleId) {
                    // Alla hinder är klarade, gå till mål (om inte redan i mål)
                    const isPlayerAtFinish = userId && game.playersAtFinish?.includes(userId);
                    if (isPlayerAtFinish) {
                        nextDescription = 'I mål - väntar på andra';
                        nextStage = 'AT_FINISH_WAITING';
                    } else {
                        nextTarget = getTargetCoordinates(finishPoint);
                        nextStage = 'MOVING_TO_FINISH';
                        nextDescription = 'Gå till mål';
                    }
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

            case 'AT_FINISH_WAITING':
            case 'ALL_FINISHED':
                // Spelaren är redan i mål, gör ingenting
                nextDescription = simulationState.description;
                nextStage = simulationState.stage;
                break;

            case 'FINISHED':
                // Om simuleringen är "finished" men spelet är startat, kör AT_START logiken direkt
                // Kör samma logik som AT_START case
                if (game.status !== 'started') {
                    nextDescription = 'Väntar på att spelet startar';
                    nextStage = 'AT_START';
                    break;
                }

                const activeObstacleId_finished = getValidActiveObstacleId();

                if (!activeObstacleId_finished) {
                    const isPlayerAtFinish = userId && game.playersAtFinish?.includes(userId);
                    if (isPlayerAtFinish) {
                        nextDescription = 'I mål - väntar på andra';
                        nextStage = 'AT_FINISH_WAITING';
                    } else {
                        nextTarget = getTargetCoordinates(finishPoint);
                        nextStage = 'MOVING_TO_FINISH';
                        nextDescription = 'Gå till mål';
                    }
                } else {
                    const activeObstacle_finished = course.obstacles?.find(o => o.obstacleId === activeObstacleId_finished);
                    if (activeObstacle_finished) {
                        nextTarget = getTargetCoordinates(activeObstacle_finished);
                        nextStage = 'MOVING_TO_OBSTACLE';
                        const currentIndex = course.obstacles?.findIndex(o => o.obstacleId === activeObstacleId_finished) || 0;
                        const hinderNames = ['första', 'andra', 'tredje', 'fjärde', 'femte', 'sjätte', 'sjunde', 'åttonde', 'nionde', 'tionde'];
                        const hinderName = hinderNames[currentIndex] || `${currentIndex + 1}:e`;
                        nextDescription = `Gå till ${hinderName} hindret`;
                    } else {
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

        } else {
        }
    }, [game, simulationState.stage, simulationState.description, position, simulationSpeed, getValidActiveObstacleId, userId]);

    // Uppdatera simuleringsstatusen när spelet ändras
    useEffect(() => {
        if (!isDebug || !game) return;

        const course = game.course;
        if (!course) return;

        // Beräkna vad nästa steg ska vara baserat på spelets nuvarande tillstånd
        let expectedDescription = '';
        let expectedStage = simulationState.stage;

        // Kontrollera om denna spelare är i mål
        const isPlayerAtFinish = userId && game.playersAtFinish?.includes(userId);
        // eslint-disable-next-line no-unused-vars
        const allPlayersFinished = game.allPlayersFinished === true;


        // Logik för att bestämma vad knappen ska visa
        if (game.status === 'pending' || game.status === 'ready') {
            expectedDescription = 'Gå till start';
            expectedStage = 'IDLE';
        } else if (game.status === 'started') {
            const validActiveObstacleId = getValidActiveObstacleId();
            if (validActiveObstacleId) {
                // Det finns ett aktivt hinder (baserat på validering)
                const activeObstacle = course.obstacles?.find(o => o.obstacleId === validActiveObstacleId);
                if (activeObstacle) {
                    const currentIndex = course.obstacles.findIndex(o => o.obstacleId === validActiveObstacleId);
                    const hinderNames = ['första', 'andra', 'tredje', 'fjärde', 'femte', 'sjätte', 'sjunde', 'åttonde', 'nionde', 'tionde'];
                    const hinderName = hinderNames[currentIndex] || `${currentIndex + 1}:e`;

                    // Om vi redan är vid rätt hinder, visa "Vid X hindret", annars "Gå till X hindret"
                    if (simulationState.stage === 'AT_OBSTACLE' && simulationState.description.includes(hinderName)) {
                        expectedDescription = `Vid ${hinderName} hindret`;
                        expectedStage = 'AT_OBSTACLE';
                    } else {
                        expectedDescription = `Gå till ${hinderName} hindret`;
                        expectedStage = 'AT_START'; // eller AT_OBSTACLE beroende på var vi är
                    }
                }
            } else if (game.completedObstacles?.length > 0) {
                // Alla hinder är klarade
                if (isPlayerAtFinish) {
                    // Spelaren är redan i mål
                    expectedDescription = 'I mål - väntar på andra';
                    expectedStage = 'AT_FINISH_WAITING';
                } else {
                    // Spelaren är inte i mål än, ska gå dit
                    expectedDescription = 'Gå till mål';
                    expectedStage = 'AT_FINISH';
                }
            }
        }

        // Uppdatera bara om beskrivningen faktiskt är annorlunda
        if (expectedDescription && expectedDescription !== simulationState.description) {
            setSimulationState({ stage: expectedStage, description: expectedDescription });
        }
    }, [game, isDebug, simulationState.stage, simulationState.description, getValidActiveObstacleId, teamMembers, userId]);

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
            const newPosition = { coords: { latitude: nextLatitude, longitude: nextLongitude } };


            setPosition(newPosition);

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
                    if (finalStage === 'AT_START') {
                        if (game?.status === 'started') {
                            const validActiveObstacleId = getValidActiveObstacleId();
                            if (validActiveObstacleId) {
                                const activeObstacle = game.course?.obstacles?.find(o => o.obstacleId === validActiveObstacleId);
                                if (activeObstacle) {
                                    const currentIndex = game.course.obstacles.findIndex(o => o.obstacleId === validActiveObstacleId);
                                    const hinderNames = ['första', 'andra', 'tredje', 'fjärde', 'femte', 'sjätte', 'sjunde', 'åttonde', 'nionde', 'tionde'];
                                    const hinderName = hinderNames[currentIndex] || `${currentIndex + 1}:e`;
                                    newDescription = `Gå till ${hinderName} hindret`;
                                }
                            }
                        } else {
                            newDescription = 'Väntar på att spelet startar';
                        }
                    } else if (finalStage === 'AT_FINISH') {
                        newDescription = 'Vid målet - tryck Avsluta Spel';
                    } else if (finalStage === 'AT_OBSTACLE') {
                        const validActiveObstacleId = getValidActiveObstacleId();
                        if (validActiveObstacleId) {
                            const activeObstacle = game.course?.obstacles?.find(o => o.obstacleId === validActiveObstacleId);
                            if (activeObstacle) {
                                const currentIndex = game.course.obstacles.findIndex(o => o.obstacleId === validActiveObstacleId);
                                const hinderNames = ['första', 'andra', 'tredje', 'fjärde', 'femte', 'sjätte', 'sjunde', 'åttonde', 'nionde', 'tionde'];
                                const hinderName = hinderNames[currentIndex] || `${currentIndex + 1}:e`;
                                newDescription = `Vid ${hinderName} hindret`;
                            }
                        }
                    }

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
    }, [isDebug, animationTarget, simulationState.stage, game, getValidActiveObstacleId]);

    // ENKEL OCH STABIL GEOLOCATION - utan komplex filtrering eller smoothing
    useEffect(() => {
        if (paused || isDebug) {
            if (isDebug && !position) {
                setPosition({ coords: KALMAR_DEFAULT_LOCATION });
            }
            return;
        }

        if (permissionDenied.current) {
            return;
        }

        if (!('geolocation' in navigator)) {
            setError(new Error('Geolocation is not supported.'));
            return;
        }

        // ENKLA inställningar - inget krångel
        const simpleOptions = {
            enableHighAccuracy: true,
            timeout: 60000, // 1 minut timeout
            maximumAge: 30000 // Acceptera 30 sekunder gamla positioner
        };

        const watcher = navigator.geolocation.watchPosition(
            (pos) => {
                permissionDenied.current = false;
                // Acceptera ALL positioner - ingen filtrering
                setPosition(pos);
                setError(null); // Rensa fel vid lyckad position
            },
            (err) => {
                console.warn('Geolocation error:', err);
                if (err.code === 1) {
                    permissionDenied.current = true;
                }
                // Sätt bara error om det inte är timeout eller position unavailable
                if (err.code !== 3 && err.code !== 2) {
                    setError(err);
                }
            },
            simpleOptions
        );

        return () => navigator.geolocation.clearWatch(watcher);
    }, [isDebug, paused, position]); // Minimal dependency array

    // Funktion för att manuellt sätta position i debug-läge
    const setPositionManually = useCallback((newPosition) => {
        if (isDebug) {
            setPosition(newPosition);
        }
    }, [isDebug]);

    return { position, error, advanceSimulation, simulationState, setPositionManually };
};

export default useGeolocation;