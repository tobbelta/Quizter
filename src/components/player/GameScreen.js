// KORRIGERING: Importerar 'useMemo' från react
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, arrayUnion, serverTimestamp, getDoc, setDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { useDebug } from '../../context/DebugContext';
import { calculateDistance } from '../../utils/location';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useAdaptiveLoading } from '../../hooks/useNetworkStatus';

import GameHeader from './GameHeader';
import { selfIcon, TeamMarker, ObstacleMarker, startIcon, finishIcon, leaderIcon } from '../shared/MapIcons';
import Spinner from '../shared/Spinner';
import DebugLogDisplay from './DebugLogDisplay';
import DebugGameControls from './DebugGameControls';
import DebugSettings from './DebugSettings';
import RiddleModal from './RiddleModal';

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
    const { isDebug, addLog, minimalControls, showDebugInfo } = useDebug();
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
    const lastRiddleRequest = useRef(null);
    // eslint-disable-next-line no-unused-vars
    const geoErrorLogged = useRef(false);

    const mapRef = useRef();
    
    const isGeolocationPaused = !game;

    const { position, error: geoError, advanceSimulation, simulationState } = useGeolocation(
        { enableHighAccuracy: true },
        isDebug,
        game,
        isGeolocationPaused
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
                                    const playerPositions = {};
                                    playersSnapshot.forEach(playerDoc => {
                                        playerPositions[playerDoc.id] = playerDoc.data().position;
                                    });

                                    const memberPromises = teamData.memberIds.map(id => getDoc(doc(db, 'users', id)));
                                    const memberDocs = await Promise.all(memberPromises);
                                    
                                    const validMembers = memberDocs
                                        .filter(mdoc => mdoc.exists())
                                        .map(mdoc => ({ 
                                            uid: mdoc.id, 
                                            ...mdoc.data(),
                                            position: playerPositions[mdoc.id] || null
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
    }, [gameId, navigate, user, addLog]);

    useEffect(() => {
        const isLeader = user?.uid === team?.leaderId;
        if (game && !game.startTime && position && isLeader && !isStarting) {
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
                console.log('Setting riddle modal visible with data:', obstacleData);
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

    const handleRiddleAnswer = useCallback(async (isCorrect) => {
        if (!game || !game.activeObstacleId) return;

        const gameRef = doc(db, 'games', gameId);
        const currentObstacleIndex = game.course.obstacles.findIndex(o => o.obstacleId === game.activeObstacleId);
        const nextObstacleIndex = currentObstacleIndex + 1;

        addLog(`Gåta besvarad ${isCorrect ? 'korrekt' : 'inkorrekt'}`);

        // Stäng gåtan och nollställ state
        setShowRiddle(false);
        setCurrentObstacle(null);
        setRiddleShownFor(null);

        // Bara gå vidare om svaret är korrekt
        if (isCorrect) {
            if (nextObstacleIndex < game.course.obstacles.length) {
                const nextObstacle = game.course.obstacles[nextObstacleIndex];
                addLog(`Rätt svar! Nästa hinder aktiverat: ${nextObstacle.obstacleId}`);
                await updateDoc(gameRef, {
                    completedObstacles: arrayUnion(game.activeObstacleId),
                    activeObstacleId: nextObstacle.obstacleId,
                });
                // Låt advanceSimulation hantera övergången till nästa hinder automatiskt
            } else {
                addLog("Alla hinder klarade! Målet är nu synligt. Spelet fortsätter tills alla når målet.");
                await updateDoc(gameRef, {
                    completedObstacles: arrayUnion(game.activeObstacleId),
                    activeObstacleId: null,
                });
                // Låt advanceSimulation hantera övergången till mål automatiskt
            }
        } else {
            addLog("Fel svar! Du måste svara rätt för att fortsätta. Försök igen när du är redo.");
            // Gör ingenting mer - låt spelaren försöka igen
        }
    }, [game, gameId, addLog]);

    const checkObstacleProximity = useCallback((lat, lon) => {
        if (!game || !game.startTime || !game.activeObstacleId) return;

        const activeObstacle = game.course.obstacles.find(o => o.obstacleId === game.activeObstacleId);
        if (!activeObstacle) return;

        const obstacleLat = activeObstacle.location?.latitude || activeObstacle.position?.lat || activeObstacle.lat;
        const obstacleLng = activeObstacle.location?.longitude || activeObstacle.position?.lng || activeObstacle.lng;
        if (typeof obstacleLat !== 'number' || typeof obstacleLng !== 'number') return;
        
        const distance = calculateDistance(lat, lon, obstacleLat, obstacleLng);
        const obstacleRadius = activeObstacle.radius || 15;

        if (distance <= obstacleRadius) {
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
        }
    }, [game, showObstacleRiddle, addLog, isDebug]);

    const checkFinishProximity = useCallback(async (lat, lon) => {
        if (!game || !game.startTime || game.activeObstacleId || game.status === 'finished') return;
        if (game.completedObstacles?.length !== game.course.obstacles.length) return;

        const finishPoint = game.course?.finishPoint || game.course?.finish;
        if (!finishPoint) return;

        const finishLat = finishPoint.latitude || finishPoint.lat;
        const finishLng = finishPoint.longitude || finishPoint.lng;
        if (typeof finishLat !== 'number' || typeof finishLng !== 'number') return;

        const distance = calculateDistance(lat, lon, finishLat, finishLng);
        const FINISH_RADIUS = 20;

        if (distance <= FINISH_RADIUS) {
            const gameRef = doc(db, 'games', gameId);

            // Lägg till denne spelare till de som nått målet
            await updateDoc(gameRef, {
                playersAtFinish: arrayUnion(user.uid)
            });

            addLog("Du har nått målet!");

            // Kontrollera om alla teammedlemmar nått målet
            const updatedPlayersAtFinish = [...(game.playersAtFinish || []), user.uid];
            if (updatedPlayersAtFinish.length >= team.memberIds.length) {
                addLog("Alla teammedlemmar har nått målet! Spelet avslutat.");
                await updateDoc(gameRef, {
                    status: 'finished',
                    endTime: serverTimestamp(),
                });
                // I debug-läge: vänta lite längre så man hinner se vad som händer
                const delay = isDebug ? 5000 : 2000;
                setTimeout(() => {
                    navigate(`/report/${gameId}`);
                }, delay);
            }
        }
    }, [game, team, user, gameId, addLog, navigate, isDebug]);

    useEffect(() => {
        if (!position || !game || !team || !user) return;
        const { latitude, longitude } = position.coords;

        const playerRef = doc(db, 'games', gameId, 'players', user.uid);
        setDoc(playerRef, {
            position: { latitude, longitude },
            lastUpdate: serverTimestamp()
        }, { merge: true }).catch(err => console.error("Kunde inte uppdatera position:", err));

        checkObstacleProximity(latitude, longitude);

        // I riktigt spel: kolla målnärheten automatiskt
        // I simulering: bara när man klickar "Avsluta Spel"
        if (!isDebug) {
            checkFinishProximity(latitude, longitude);
        }
    }, [position, game, team, user, gameId, checkObstacleProximity, checkFinishProximity, isDebug]);
    
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

                {/* Visa bara aktivt hinder om spelet har startat */}
                {game.activeObstacleId && game.course.obstacles
                    .filter(obstacle => obstacle.obstacleId === game.activeObstacleId)
                    .map(obstacle => (
                        <ObstacleMarker
                            key={obstacle.obstacleId}
                            obstacle={obstacle}
                            isCompleted={false}
                        />
                    ))
                }

                {/* Visa mål bara när alla hinder är klarade */}
                {!game.activeObstacleId && game.completedObstacles?.length > 0 && (
                    <Marker position={[finishLat, finishLng]} icon={finishIcon}><Popup>Mål</Popup></Marker>
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

            {isDebug && (
                <div className={`fixed ${minimalControls ? 'bottom-4 left-4' : 'bottom-4 left-4 right-4'} z-[1000] ${minimalControls ? '' : 'p-4'} flex gap-4`}>
                    {!minimalControls && showDebugInfo && <DebugLogDisplay />}
                    <DebugGameControls
                        onAdvanceSimulation={advanceSimulation}
                        simulationState={simulationState}
                        onCompleteObstacle={(type) => {
                            if (type === 'finish') {
                                // Simulera målgång
                                if (position) {
                                    checkFinishProximity(position.coords.latitude, position.coords.longitude);
                                }
                            } else {
                                // Visa gåta för hinder
                                const now = Date.now();
                                lastRiddleRequest.current = now;
                                showObstacleRiddle(game.activeObstacleId);
                            }
                        }}
                        game={game}
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

        </div>
    );
};

export default GameScreen;