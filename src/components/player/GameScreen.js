// KORRIGERING: Importerar 'useMemo' från react
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, arrayUnion, serverTimestamp, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { useDebug } from '../../context/DebugContext';
import { calculateDistance } from '../../utils/location';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useAdaptiveLoading } from '../../hooks/useNetworkStatus';

import GameHeader from './GameHeader';
import { selfIcon, TeamMarker, ObstacleMarker, startIcon, finishIcon, leaderIcon } from '../shared/MapIcons';
import Spinner from '../shared/Spinner';
import DebugGameControls from './DebugGameControls';
import DebugSettings from './DebugSettings';
import RiddleModal from './RiddleModal';
import PlayerLegend from './PlayerLegend';

const GeolocationDeniedScreen = () => (
    <div className="absolute inset-0 z-[2000] bg-background bg-opacity-95 flex flex-col items-center justify-center text-center p-8">
        <h2 className="text-3xl font-bold text-accent-red mb-4">Platsåtkomst Krävs</h2>
        <p className="text-text-secondary mb-6 max-w-md">
            GeoQuest kräver tillgång till din plats för att kunna spelas. Vänligen aktivera platstjänster för den här webbplatsen i din webbläsares inställningar.
        </p>
        <button onClick={() => window.location.reload()} className="sc-button sc-button-blue">
            Ladda om sidan efter ändring
        </button>
    </div>
);

const GameScreen = ({ user, userData }) => {
    const { gameId } = useParams();
    const navigate = useNavigate();
    const { isDebug, addLog, minimalControls } = useDebug();
    const adaptiveLoading = useAdaptiveLoading();
    // const batteryStatus = useBatteryStatus(); // Currently unused

    const [game, setGame] = useState(null);
    const [team, setTeam] = useState(null);
    const [teamMembers, setTeamMembers] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [isStarting, setIsStarting] = useState(false);
    const [showRiddle, setShowRiddle] = useState(false);
    const [currentObstacle, setCurrentObstacle] = useState(null);
    const [riddleShownFor, setRiddleShownFor] = useState(null);
    const [showPlayerLegend, setShowPlayerLegend] = useState(false);
    const lastRiddleRequest = useRef(null);
    // eslint-disable-next-line no-unused-vars
    const geoErrorLogged = useRef(false);

    const mapRef = useRef();
    
    const isGeolocationPaused = !game;

    const { position, error: geoError, advanceSimulation, simulationState, setPositionManually } = useGeolocation(
        { enableHighAccuracy: true },
        isDebug,
        game,
        isGeolocationPaused,
        user?.uid,
        teamMembers
    );

    // KORRIGERING: Använder useMemo för att förhindra att ett nytt Date-objekt skapas vid varje rendering.
    // Detta stabiliserar GameHeader och ser till att timern bara startas en gång.
    const startTimeDate = useMemo(() => {
        if (!game?.startTime) {
            return undefined;
        }
        // Hantera både Firestore Timestamp och vanliga Date objekt
        try {
            const result = game.startTime.toDate ? game.startTime.toDate() : new Date(game.startTime);
            return result;
        } catch (error) {
            console.error('Fel vid konvertering av startTime:', error);
            return undefined;
        }
    }, [game?.startTime]);

    // Logga startTime-konvertering i separat useEffect för att undvika setState-in-render
    useEffect(() => {
        if (!game?.startTime) {
            addLog('Ingen startTime i game-objektet');
        } else if (startTimeDate) {
            addLog(`StartTime konverterat: ${startTimeDate.toISOString()}`);
        } else {
            addLog('Fel vid startTime-konvertering');
        }
    }, [game?.startTime, startTimeDate, addLog]);


    useEffect(() => {
        if (geoError && !geoErrorLogged.current) {
            geoErrorLogged.current = true;
            if (isDebug) {
                // Bara logga geolocation-fel i debug-läge
                addLog(`Geolocation Error: ${geoError.message}`);
            }
            // Logga endast en gång i produktionsläge för felsökning
            else if (geoError.code === 1) {
                console.warn('Geolocation permission denied by user');
            }
        }

        // Reset the flag if error is cleared
        if (!geoError) {
            geoErrorLogged.current = false;
        }
    }, [geoError, addLog, isDebug]);

    useEffect(() => {
        if (!gameId) {
            setLoading(false);
            setError("Inget spel-ID angivet.");
            return;
        }

        let unsubscribeTeam = () => {};
        let unsubscribePlayers = () => {};

        const gameRef = doc(db, 'games', gameId);
        const unsubscribeGame = onSnapshot(gameRef, (gameDoc) => {
            if (!gameDoc.exists()) {
                setError('Spelet hittades inte.');
                setLoading(false);
                navigate('/teams');
                return;
            }

            const gameData = { id: gameDoc.id, ...gameDoc.data() };
            setGame(gameData);

            if (gameData.activeObstacleId) {
                addLog(`Aktivt hinder: ${gameData.activeObstacleId}`);
                // Debug: Visa obstacle-struktur vid första gången
                const activeObstacle = gameData.course?.obstacles?.find(o => o.obstacleId === gameData.activeObstacleId);
                if (activeObstacle) {
                    addLog(`Hinder-struktur: ${JSON.stringify(activeObstacle)}`);
                }
            } else {
                addLog(`Inget aktivt hinder satt i spelet`);
            }

            unsubscribeTeam();
            unsubscribePlayers();

            if (gameData.teamId) {
                const teamRef = doc(db, 'teams', gameData.teamId);
                unsubscribeTeam = onSnapshot(teamRef, (teamDoc) => {
                    const fetchTeamData = async () => {
                        try {
                            if (!teamDoc.exists()) throw new Error("Kunde inte hitta tillhörande lag.");
                            const teamData = { id: teamDoc.id, ...teamDoc.data() };
                            setTeam(teamData);

                            if (user?.uid && teamData.leaderId) {
                                const isLeader = user.uid === teamData.leaderId;
                                addLog(`Kontrollerar lagledarstatus: Du är ${isLeader ? 'lagledare' : 'inte lagledare'}.`);

                            }

                            if (teamData.memberIds?.length > 0) {
                                const playerPositionsRef = collection(db, 'games', gameId, 'players');
                                unsubscribePlayers = onSnapshot(playerPositionsRef, async (playersSnapshot) => {
                                    const playerData = {};
                                    playersSnapshot.forEach(playerDoc => {
                                        const data = playerDoc.data();
                                        playerData[playerDoc.id] = {
                                            position: data.position || null,
                                            lastUpdate: data.lastUpdate || null,
                                            isActive: data.isActive !== undefined ? data.isActive : false
                                        };
                                    });

                                    const memberPromises = teamData.memberIds.map(id => getDoc(doc(db, 'users', id)));
                                    const memberDocs = await Promise.all(memberPromises);

                                    const validMembers = memberDocs
                                        .filter(mdoc => mdoc.exists())
                                        .map(mdoc => ({
                                            uid: mdoc.id,
                                            ...mdoc.data(),
                                            position: playerData[mdoc.id]?.position || null,
                                            lastUpdate: playerData[mdoc.id]?.lastUpdate || null,
                                            isActive: playerData[mdoc.id]?.isActive || false
                                        }));
                                    setTeamMembers(validMembers);
                                });
                            } else {
                                setTeamMembers([]);
                            }
                        } catch (e) {
                            console.error("Fel vid hämtning av lagdata:", e);
                            setError("Ett fel uppstod vid laddning av lagdata.");
                        } finally {
                            setLoading(false);
                        }
                    };
                    fetchTeamData();
                });
            } else {
                setTeam(null);
                setTeamMembers([]);
                setLoading(false);
            }
        });

        return () => {
            unsubscribeGame();
            unsubscribeTeam();
            unsubscribePlayers();
        };
    }, [gameId, navigate, user, addLog, userData?.displayName]);

    // Effect för att sätta spelet till 'ready' när lagledaren kommer till spelet första gången
    useEffect(() => {
        const isLeader = user?.uid === team?.leaderId;
        if (game && game.status === 'pending' && isLeader) {
            addLog("Lagledaren gick till spelet - sätter status till 'ready'");
            const gameRef = doc(db, 'games', gameId);
            updateDoc(gameRef, {
                status: 'ready'
            }).catch(err => {
                console.error("Kunde inte uppdatera spelstatus:", err);
            });
        }
    }, [game, team?.leaderId, user?.uid, gameId, addLog]);

    // Effect för att starta spelet när lagledaren når startpunkten
    useEffect(() => {
        const isLeader = user?.uid === team?.leaderId;
        if (game && game.status === 'ready' && !game.startTime && position && isLeader && !isStarting) {
            const startPoint = game.course?.startPoint || game.course?.start;
            if (!startPoint) return;

            const startLat = startPoint.latitude || startPoint.lat;
            const startLng = startPoint.longitude || startPoint.lng;
            const { latitude, longitude } = position.coords;

            const START_RADIUS = 20;
            const distance = calculateDistance(latitude, longitude, startLat, startLng);

            if (distance <= START_RADIUS) {
                setIsStarting(true); // Förhindra flera starter
                const gameRef = doc(db, 'games', gameId);
                const firstObstacle = game.course?.obstacles?.[0];
                const updateData = {
                    startTime: serverTimestamp(),
                    status: 'started'
                };

                // Aktivera första hindret om det finns
                if (firstObstacle) {
                    updateData.activeObstacleId = firstObstacle.obstacleId;
                    addLog(`Aktiverar första hindret: ${firstObstacle.obstacleId}`);
                } else {
                    addLog(`Inget första hinder hittades. Obstacles: ${JSON.stringify(game.course?.obstacles)}`);
                }

                updateDoc(gameRef, updateData).then(() => {
                    addLog("Lagledaren nådde startpunkten. Spelet har startat!");
                    addLog(`Första hindret aktiverat: ${firstObstacle?.obstacleId || 'ingen'}`);
                }).catch(err => {
                    console.error("Kunde inte starta spelet:", err);
                    setIsStarting(false); // Återställ flaggan vid fel
                });
            }
        }
    }, [position, game, team, user, gameId, addLog, isStarting]);

    // Återställ isStarting när spelet faktiskt har startat
    useEffect(() => {
        if (game?.startTime && isStarting) {
            setIsStarting(false);
        }
    }, [game?.startTime, isStarting]);

    const showObstacleRiddle = useCallback(async (obstacleId) => {
        if (!game || !obstacleId) return;

        // Förhindra dubbelanrop
        if (showRiddle || riddleShownFor === obstacleId) {
            addLog(`Gåta redan visas eller visad för ${obstacleId}, hoppar över anrop`);
            return;
        }

        const obstacle = game.course.obstacles.find(o => o.obstacleId === obstacleId);
        if (!obstacle) {
            addLog(`Hinder inte hittat i course.obstacles för ID: ${obstacleId}`);
            return;
        }

        // Hämta obstacle-detaljer från databasen
        try {
            addLog(`Försöker hämta obstacle-data för ID: ${obstacleId}`);
            const obstacleDoc = await getDoc(doc(db, 'obstacles', obstacleId));
            if (obstacleDoc.exists()) {
                const obstacleData = obstacleDoc.data();
                setCurrentObstacle(obstacleData);
                setShowRiddle(true);
                setRiddleShownFor(obstacleId);
                addLog(`Gåta-modal aktiverad för hinder: ${obstacleId}`);
            } else {
                addLog(`Obstacle-dokument existerar inte för ID: ${obstacleId}`);
            }
        } catch (error) {
            console.error("Fel vid hämtning av hinderdata:", error);
            addLog(`Fel vid hämtning av gåta för hinder: ${obstacleId} - ${error.message}`);
        }
    }, [game, riddleShownFor, showRiddle, addLog]);

    // Hjälpfunktion för att hitta giltiga hinder
    const getValidObstacles = useCallback(() => {
        if (!game || !game.completedObstaclesDetailed || !teamMembers) return [];

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

        return validObstacles;
    }, [game, teamMembers]);


    // Kontrollera vilka hinder som är giltigt lösta (lösta av aktiva spelare)
    const validateCompletedObstacles = useCallback(() => {
        if (!game || !game.completedObstaclesDetailed || !teamMembers) return;

        const validObstacles = getValidObstacles();
        const allObstacles = game.course?.obstacles || [];
        const validObstacleIds = validObstacles.map(o => o.obstacleId);

        // Kolla om alla hinder som ska vara lösta faktiskt är lösta
        const expectedSolvedCount = Math.min(allObstacles.length, game.completedObstacles?.length || 0);
        const missingCount = expectedSolvedCount - validObstacleIds.length;

        if (missingCount > 0) {
            addLog(`Hittade ${missingCount} hinder som behöver lösas igen (lösaren är inaktiv)`);

            // Uppdatera bara completedObstacles (behåll completedObstaclesDetailed för historik)

            // Hitta vilket hinder som nu ska vara aktivt (hinder måste lösas i ordning)
            let nextActiveObstacle = null;
            for (let i = 0; i < allObstacles.length; i++) {
                const obstacleId = allObstacles[i].obstacleId;
                if (!validObstacleIds.includes(obstacleId)) {
                    nextActiveObstacle = obstacleId;
                    break;
                }
            }

            addLog(`Giltiga hinder: ${validObstacleIds.length}/${allObstacles.length}, nästa: ${nextActiveObstacle || 'mål'}`);

            // Uppdatera spelet
            const gameRef = doc(db, 'games', gameId);
            updateDoc(gameRef, {
                completedObstacles: validObstacleIds,
                activeObstacleId: nextActiveObstacle
            }).catch(err => {
                console.error("Kunde inte uppdatera spelet efter validering:", err);
            });
        }
    }, [game, teamMembers, gameId, addLog, getValidObstacles]);

    // Spåra föregående teamMembers för att endast köra validering när spelare blir inaktiva
    const prevActiveMembers = useRef([]);

    // Kör validering endast när spelare blir inaktiva (inte när de blir aktiva)
    useEffect(() => {
        if (!game || game.status !== 'started' || !teamMembers) return;

        const currentActiveUIDs = teamMembers.filter(m => m.isActive === true).map(m => m.uid);
        const prevActiveUIDs = prevActiveMembers.current;

        // Kolla om någon spelare blev inaktiv (fanns i prev men inte i current)
        const becameInactive = prevActiveUIDs.filter(uid => !currentActiveUIDs.includes(uid));

        if (becameInactive.length > 0) {
            addLog(`Spelare blev inaktiva: ${becameInactive.join(', ')} - kör validering`);
            validateCompletedObstacles();
        } else if (prevActiveUIDs.length > 0) {
            // Endast logga när spelare blir aktiva (för debug)
            const becameActive = currentActiveUIDs.filter(uid => !prevActiveUIDs.includes(uid));
            if (becameActive.length > 0) {
                addLog(`Spelare blev aktiva: ${becameActive.join(', ')} - ingen validering behövs`);
            }
        }

        // Uppdatera föregående aktiva medlemmar
        prevActiveMembers.current = currentActiveUIDs;
    }, [teamMembers, validateCompletedObstacles, game, addLog]);

    const handleRiddleAnswer = useCallback(async (isCorrect) => {
        if (!game || !game.activeObstacleId) return;

        const gameRef = doc(db, 'games', gameId);
        const currentObstacleIndex = game.course.obstacles.findIndex(o => o.obstacleId === game.activeObstacleId);
        // eslint-disable-next-line no-unused-vars
        const nextObstacleIndex = currentObstacleIndex + 1;

        addLog(`Gåta besvarad ${isCorrect ? 'korrekt' : 'inkorrekt'}`);

        // Stäng gåtan och nollställ state
        setShowRiddle(false);
        setCurrentObstacle(null);
        setRiddleShownFor(null);

        // Bara gå vidare om svaret är korrekt
        if (isCorrect) {
            // Skapa ett objekt som sparar både hinder-ID och vem som löste det
            const completedObstacleEntry = {
                obstacleId: game.activeObstacleId,
                solvedBy: user.uid,
                solvedAt: new Date(), // Använd vanlig Date istället för serverTimestamp() i arrayUnion
                solverName: user.displayName || userData?.displayName || 'Okänd spelare',
                solverWasActive: true, // Spelaren var aktiv vid lösningstidpunkt (eftersom de kunde lösa gåtan)
                activePlayersWhenSolved: await (async () => {
                    // Hämta färsk data från Firebase för att undvika race conditions
                    const playerPositionsRef = collection(db, 'games', gameId, 'players');
                    const playersSnapshot = await getDocs(playerPositionsRef);

                    const freshPlayerData = {};
                    playersSnapshot.forEach(playerDoc => {
                        const data = playerDoc.data();
                        freshPlayerData[playerDoc.id] = {
                            isActive: data.isActive !== undefined ? data.isActive : false
                        };
                    });

                    // Använd färsk data istället för cached teamMembers
                    const activeMembers = teamMembers.filter(member => {
                        const freshIsActive = freshPlayerData[member.uid]?.isActive || false;
                        return freshIsActive === true;
                    });


                    return activeMembers.map(member => ({
                        uid: member.uid,
                        name: member.displayName || member.name || 'Okänd spelare'
                    }));
                })()
            };

            // Hitta nästa ej-lösta hinder
            let nextActiveObstacle = null;
            const validObstacles = getValidObstacles();
            const validObstacleIds = validObstacles.map(o => o.obstacleId);

            for (let i = 0; i < game.course.obstacles.length; i++) {
                const obstacleId = game.course.obstacles[i].obstacleId;
                if (!validObstacleIds.includes(obstacleId) && obstacleId !== game.activeObstacleId) {
                    nextActiveObstacle = obstacleId;
                    break;
                }
            }

            if (nextActiveObstacle) {
                addLog(`Rätt svar! Nästa hinder aktiverat: ${nextActiveObstacle}. Löst av: ${completedObstacleEntry.solverName}`);
                await updateDoc(gameRef, {
                    completedObstacles: arrayUnion(game.activeObstacleId), // Behåll för bakåtkompatibilitet
                    completedObstaclesDetailed: arrayUnion(completedObstacleEntry), // Ny detaljerad data
                    activeObstacleId: nextActiveObstacle,
                });
                // Låt advanceSimulation hantera övergången till nästa hinder automatiskt
            } else {
                addLog(`Alla hinder klarade! Målet är nu synligt. Sista hindret löst av: ${completedObstacleEntry.solverName}`);
                await updateDoc(gameRef, {
                    completedObstacles: arrayUnion(game.activeObstacleId), // Behåll för bakåtkompatibilitet
                    completedObstaclesDetailed: arrayUnion(completedObstacleEntry), // Ny detaljerad data
                    activeObstacleId: null,
                });
                // Låt advanceSimulation hantera övergången till mål automatiskt
            }
        } else {
            addLog("Fel svar! Du måste svara rätt för att fortsätta. Försök igen när du är redo.");
            // Gör ingenting mer - låt spelaren försöka igen
        }
    }, [game, gameId, addLog, getValidObstacles, teamMembers, user.uid, user.displayName, userData?.displayName]);

    const checkObstacleProximity = useCallback((lat, lon) => {
        addLog(`checkObstacleProximity anropad: lat=${lat}, lon=${lon}`);

        if (!game) {
            addLog('checkObstacleProximity: Inget spel');
            return;
        }
        if (game.status !== 'started') {
            addLog(`checkObstacleProximity: Spelstatus är ${game.status}, inte started`);
            return;
        }
        if (!game.startTime) {
            addLog('checkObstacleProximity: Ingen startTime');
            return;
        }
        if (!game.activeObstacleId) {
            addLog('checkObstacleProximity: Inget aktivt hinder - alla hinder är lösta');
            return;
        }

        const activeObstacle = game.course.obstacles.find(o => o.obstacleId === game.activeObstacleId);
        if (!activeObstacle) {
            addLog(`checkObstacleProximity: Aktivt hinder ${game.activeObstacleId} hittades inte`);
            return;
        }

        const obstacleLat = activeObstacle.location?.latitude || activeObstacle.position?.lat || activeObstacle.lat;
        const obstacleLng = activeObstacle.location?.longitude || activeObstacle.position?.lng || activeObstacle.lng;
        if (typeof obstacleLat !== 'number' || typeof obstacleLng !== 'number') {
            addLog(`checkObstacleProximity: Ogiltiga koordinater för hinder: lat=${obstacleLat}, lng=${obstacleLng}`);
            return;
        }

        const distance = calculateDistance(lat, lon, obstacleLat, obstacleLng);
        // Använd större radie i debug-läge för att kompensera för simulerings-oprecision
        const baseRadius = activeObstacle.radius || 15;
        const obstacleRadius = isDebug ? Math.max(baseRadius, 20) : baseRadius;
        addLog(`checkObstacleProximity: Avstånd till hinder: ${distance.toFixed(1)}m (radie: ${obstacleRadius}m${isDebug ? ' [debug-förstärkt]' : ''})`);

        if (distance <= obstacleRadius) {
            addLog(`checkObstacleProximity: Inom radie! Visar gåta för ${activeObstacle.obstacleId}`);
            // I riktigt spel: visa gåtan automatiskt
            // I simulering: bara logga att man nått hindret
            if (!isDebug) {
                const now = Date.now();
                if (!lastRiddleRequest.current || now - lastRiddleRequest.current > 5000) {
                    lastRiddleRequest.current = now;
                    showObstacleRiddle(activeObstacle.obstacleId);
                }
            } else {
                addLog(`Nått hinder ${activeObstacle.obstacleId}. Klicka 'Visa Gåta' för att fortsätta.`);
            }
        } else {
            addLog(`checkObstacleProximity: Utanför radie (${distance.toFixed(1)}m > ${obstacleRadius}m)`);
        }
    }, [game, showObstacleRiddle, addLog, isDebug]);

    const checkFinishProximity = useCallback(async (lat, lon) => {
        addLog(`checkFinishProximity anropad med lat: ${lat}, lon: ${lon}`);

        if (!game) {
            addLog('checkFinishProximity: Inget spel');
            return;
        }
        if (game.status !== 'started') {
            addLog(`checkFinishProximity: Spelstatus är '${game.status}', inte 'started'`);
            return;
        }
        if (!game.startTime) {
            addLog('checkFinishProximity: Ingen startTime');
            return;
        }
        if (game.activeObstacleId) {
            addLog(`checkFinishProximity: Aktivt hinder finns: ${game.activeObstacleId}`);
            return;
        }
        if (game.status === 'finished') {
            addLog('checkFinishProximity: Spelet är redan avslutat');
            return;
        }
        // Kontrollera om alla hinder är lösta av aktiva spelare
        const totalObstacles = game.course?.obstacles?.length || 0;
        const validObstacles = getValidObstacles();
        const validCount = validObstacles.length;

        addLog(`checkFinishProximity: Hinder lösta av aktiva: ${validCount}/${totalObstacles}`);
        addLog(`checkFinishProximity: ActiveObstacleId: ${game.activeObstacleId}`);

        const allObstaclesSolvedByActive = !game.activeObstacleId && validCount >= totalObstacles && totalObstacles > 0;

        if (!allObstaclesSolvedByActive) {
            addLog(`checkFinishProximity: Inte alla hinder lösta av aktiva än. Behöver lösa ${totalObstacles - validCount} till.`);
            return;
        }

        addLog('checkFinishProximity: Alla villkor uppfyllda, kollar avstånd till mål');
        addLog(`checkFinishProximity: Position: ${lat}, ${lon}`);

        const finishPoint = game.course?.finishPoint || game.course?.finish;
        if (!finishPoint) return;

        const finishLat = finishPoint.latitude || finishPoint.lat;
        const finishLng = finishPoint.longitude || finishPoint.lng;
        if (typeof finishLat !== 'number' || typeof finishLng !== 'number') return;

        const distance = calculateDistance(lat, lon, finishLat, finishLng);
        const FINISH_RADIUS = 10;

        if (distance <= FINISH_RADIUS) {
            const gameRef = doc(db, 'games', gameId);

            // Kontrollera om spelaren redan är i mål
            if (game.playersAtFinish?.includes(user.uid)) {
                addLog("Du är redan i mål!");
                return;
            }

            // Lägg till denne spelare till de som nått målet
            await updateDoc(gameRef, {
                playersAtFinish: arrayUnion(user.uid)
            });

            addLog("Du har nått målet!");

            // Kontrollera om alla AKTIVA teammedlemmar nått målet (efter uppdateringen)
            const currentPlayersAtFinish = game.playersAtFinish || [];
            const updatedPlayersAtFinish = [...currentPlayersAtFinish, user.uid];

            // Räkna endast aktiva spelare
            const activeMembers = teamMembers.filter(member => member.isActive === true);
            const activeMembersAtFinish = updatedPlayersAtFinish.filter(playerId =>
                activeMembers.some(member => member.uid === playerId)
            );

            addLog(`Aktiva spelare i mål: ${activeMembersAtFinish.length}/${activeMembers.length} (totalt ${activeMembers.length} aktiva av ${team.memberIds.length})`);

            if (activeMembersAtFinish.length >= activeMembers.length && activeMembers.length > 0) {
                addLog("Alla AKTIVA teammedlemmar har nått målet! Klicka 'Avsluta Spel' för att se rapporten.");
                // Spara vilka spelare som var aktiva vid målgång
                await updateDoc(gameRef, {
                    allPlayersFinished: true,
                    status: 'finished',
                    endTime: serverTimestamp(),
                    activePlayersAtFinish: activeMembers.map(m => m.uid) // Spara aktiva spelare vid målgång
                });
            }
        }
    }, [game, team, teamMembers, user, gameId, addLog, getValidObstacles]);

    // Effect för att hantera position-uppdateringar
    useEffect(() => {
        if (!position || !game || !team || !user) return;
        const { latitude, longitude } = position.coords;

        addLog(`Position uppdaterad: ${latitude}, ${longitude}`);

        const playerRef = doc(db, 'games', gameId, 'players', user.uid);
        setDoc(playerRef, {
            position: { latitude, longitude },
            lastUpdate: serverTimestamp(),
            isActive: true // Markera som aktiv när position uppdateras
        }, { merge: true }).catch(err => console.error("Kunde inte uppdatera position:", err));

        addLog('Anropar checkObstacleProximity');
        checkObstacleProximity(latitude, longitude);

        // Kolla målnärheten automatiskt i både riktigt spel och simulering
        // när alla hinder är lösta AV AKTIVA SPELARE
        const totalObstacles = game.course?.obstacles?.length || 0;
        const validObstacles = getValidObstacles();

        if (!game.activeObstacleId && validObstacles.length >= totalObstacles && totalObstacles > 0) {
            addLog(`Anropar checkFinishProximity (${validObstacles.length}/${totalObstacles} lösta av aktiva)`);
            checkFinishProximity(latitude, longitude);
        }
    }, [position, game, team, user, gameId, teamMembers, checkObstacleProximity, checkFinishProximity, addLog, getValidObstacles]);

    // Effect för att hantera när spelaren lämnar spelet
    useEffect(() => {
        if (!user || !gameId) return;

        const playerRef = doc(db, 'games', gameId, 'players', user.uid);

        const markPlayerInactive = () => {
            setDoc(playerRef, {
                isActive: false,
                lastUpdate: serverTimestamp()
            }, { merge: true }).catch(err => console.error("Kunde inte markera spelare som inaktiv:", err));
        };

        // När användaren stänger browser/flik
        const handleBeforeUnload = () => {
            markPlayerInactive();
        };

        // När användaren byter flik eller minimerar browser
        const handleVisibilityChange = () => {
            if (document.hidden) {
                markPlayerInactive();
            } else {
                // När spelaren kommer tillbaka, markera som aktiv igen
                setDoc(playerRef, {
                    isActive: true,
                    lastUpdate: serverTimestamp()
                }, { merge: true }).catch(err => console.error("Kunde inte markera spelare som aktiv:", err));
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Markera som aktiv när komponenten mountas
        setDoc(playerRef, {
            isActive: true,
            lastUpdate: serverTimestamp()
        }, { merge: true }).catch(err => console.error("Kunde inte markera spelare som aktiv:", err));

        return () => {
            // Cleanup: markera som inaktiv när komponenten unmountas
            markPlayerInactive();
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user, gameId]);
    
    if (!isDebug && geoError && geoError.code === 1) return <GeolocationDeniedScreen />;
    if (loading) return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;
    if (error) return <div className="flex items-center justify-center min-h-screen"><p className="text-red-500">{error}</p></div>;
    if (!game || !team) return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;

    const startPoint = game.course?.startPoint || game.course?.start;
    const finishPoint = game.course?.finishPoint || game.course?.finish;
    
    const isMapReady = 
        game.course &&
        startPoint && (typeof startPoint.latitude === 'number' || typeof startPoint.lat === 'number') && (typeof startPoint.longitude === 'number' || typeof startPoint.lng === 'number') &&
        finishPoint && (typeof finishPoint.latitude === 'number' || typeof finishPoint.lat === 'number') && (typeof finishPoint.longitude === 'number' || typeof finishPoint.lng === 'number');

    if (!isMapReady) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-red-500 text-center p-4">
                    Fel: Banan "{game.course ? game.course.name : 'Okänd'}" är felaktigt konfigurerad.<br/>
                    Den saknar giltiga koordinater för start- eller slutpunkt.
                </p>
            </div>
        );
    }

    const startLat = startPoint.latitude || startPoint.lat;
    const startLng = startPoint.longitude || startPoint.lng;
    const finishLat = finishPoint.latitude || finishPoint.lat;
    const finishLng = finishPoint.longitude || finishPoint.lng;

    const currentPosition = position ? [position.coords.latitude, position.coords.longitude] : null;
    const center = currentPosition || [startLat, startLng];
    
    return (
        <div className="h-screen w-screen overflow-hidden">
            <GameHeader
                gameName={game.course.name}
                teamName={team.name}
                // Använder det memoiserade värdet
                startTime={startTimeDate}
                gameFinished={game?.allPlayersFinished === true}
            />
            <div className="w-full" style={{ height: 'calc(100vh - 32px)' }}>
                <MapContainer
                    center={center}
                    zoom={15}
                    ref={mapRef}
                    style={{ height: '100%', width: '100%' }}
                    preferCanvas={adaptiveLoading.shouldReduceData} // Use canvas for better performance on slow devices
                    zoomControl={false} // Dölj zoom-kontroller för renare UI
                    whenCreated={(map) => {
                        // Force map to resize after creation
                        setTimeout(() => map.invalidateSize(), 100);
                    }}
                >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    maxZoom={adaptiveLoading.shouldReduceData ? 16 : 18} // Reduce max zoom on slow connections
                    tileSize={adaptiveLoading.shouldReduceData ? 128 : 256} // Smaller tiles for faster loading
                    updateWhenIdle={adaptiveLoading.shouldReduceData} // Update less frequently on slow connections
                />
                <Marker position={[startLat, startLng]} icon={startIcon}><Popup>Start</Popup></Marker>

                {/* Visa bara aktivt hinder om spelet har startat (status 'started') */}
                {game.status === 'started' && game.activeObstacleId && game.course.obstacles
                    .filter(obstacle => obstacle.obstacleId === game.activeObstacleId)
                    .map(obstacle => (
                        <ObstacleMarker
                            key={obstacle.obstacleId}
                            obstacle={obstacle}
                            isCompleted={false}
                        />
                    ))
                }

                {/* Visa alla avklarade hinder */}
                {game.completedObstacles && game.course.obstacles
                    .filter(obstacle => game.completedObstacles.includes(obstacle.obstacleId))
                    .map(obstacle => (
                        <ObstacleMarker
                            key={`completed-${obstacle.obstacleId}`}
                            obstacle={obstacle}
                            isCompleted={true}
                        />
                    ))
                }

                {/* Visa mål bara när alla hinder är klarade AV AKTIVA SPELARE och spelet har startat */}
                {game.status === 'started' && (() => {
                    const totalObstacles = game.course?.obstacles?.length || 0;
                    const validObstacles = getValidObstacles();
                    return !game.activeObstacleId && validObstacles.length >= totalObstacles && totalObstacles > 0;
                })() && (
                    <>
                        <Marker position={[finishLat, finishLng]} icon={finishIcon}><Popup>Mål</Popup></Marker>
                        {/* Synlig ring runt målområdet som visar radie (10 meter) */}
                        <Circle
                            center={[finishLat, finishLng]}
                            radius={10}
                            pathOptions={{
                                color: 'red',
                                weight: 2,
                                fillColor: 'red',
                                fillOpacity: 0.1
                            }}
                        >
                            <Popup>Målområde (20m radie)</Popup>
                        </Circle>
                    </>
                )}

                {currentPosition && (
                    <Marker position={currentPosition} icon={user.uid === team?.leaderId ? leaderIcon : selfIcon}>
                        <Popup>Du {user.uid === team?.leaderId && '(Lagledare)'}</Popup>
                    </Marker>
                )}

                {teamMembers.filter(m => m.uid !== user.uid).map((member, index) => (
                    <TeamMarker
                        key={member.uid}
                        member={member}
                        isLeader={member.uid === team?.leaderId}
                        memberIndex={index}
                    />
                ))}
            </MapContainer>
            </div>

            {/* Always show debug settings button */}
            <DebugSettings />

            {/* Player legend button */}
            <button
                onClick={() => setShowPlayerLegend(true)}
                className="fixed top-16 right-4 z-[1000] sc-button sc-button-blue p-2 text-xs"
                title="Visa lagmedlemmar & ikoner"
            >
                👥
            </button>

            {isDebug && (
                <div className={`fixed ${minimalControls ? 'bottom-4 left-4' : 'bottom-4 left-4 right-4'} z-[1000] ${minimalControls ? '' : 'p-4'} flex gap-4`}>
                    <DebugGameControls
                        onAdvanceSimulation={advanceSimulation}
                        simulationState={simulationState}
                        gameId={gameId}
                        teamMembers={teamMembers}
                        onCompleteObstacle={async (type) => {
                            if (type === 'finish') {
                                addLog('onCompleteObstacle finish anropad');

                                // I debug-läge: bara flytta spelaren till målpositionen, låt proximity-check hantera resten
                                if (isDebug) {
                                    addLog('Debug-läge: Flyttar spelaren till målpositionen');

                                    // Flytta spelaren till målpositionen på kartan
                                    const finishPoint = game.course?.finishPoint || game.course?.finish;
                                    if (finishPoint) {
                                        const targetLat = finishPoint.latitude || finishPoint.lat;
                                        const targetLng = finishPoint.longitude || finishPoint.lng;
                                        if (typeof targetLat === 'number' && typeof targetLng === 'number') {
                                            addLog(`Flyttar spelaren till målpositionen: ${targetLat}, ${targetLng}`);
                                            // Uppdatera spelarens position direkt
                                            setPositionManually({ coords: { latitude: targetLat, longitude: targetLng } });

                                            // Låt proximity-check hantera resten realistiskt efter en kort delay
                                            setTimeout(() => {
                                                addLog('Kör proximity-check efter positionsändring');
                                                checkFinishProximity(targetLat, targetLng);
                                            }, 100);
                                        }
                                    }
                                } else {
                                    // Riktigt spel: använd proximity-check
                                    if (position) {
                                        checkFinishProximity(position.coords.latitude, position.coords.longitude);
                                    }
                                }
                            } else {
                                // Visa gåta för hinder
                                const now = Date.now();
                                lastRiddleRequest.current = now;
                                showObstacleRiddle(game.activeObstacleId);
                            }
                        }}
                        game={game}
                        team={team}
                    />
                </div>
            )}

            {showRiddle && currentObstacle && (
                <RiddleModal
                    obstacle={currentObstacle}
                    onClose={() => {
                        addLog("Stänger gåta-modal");
                        setShowRiddle(false);
                        setCurrentObstacle(null);
                        setRiddleShownFor(null);
                    }}
                    onAnswer={handleRiddleAnswer}
                />
            )}

            {showPlayerLegend && (
                <PlayerLegend
                    team={team}
                    teamMembers={teamMembers}
                    gameId={gameId}
                    game={game}
                    onClose={() => setShowPlayerLegend(false)}
                />
            )}

        </div>
    );
};

export default GameScreen;