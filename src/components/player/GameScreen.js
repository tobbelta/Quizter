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

import GameHeader from './GameHeader';
import { selfIcon, TeamMarker, ObstacleMarker, startIcon, finishIcon, leaderIcon } from '../shared/MapIcons';
import Spinner from '../shared/Spinner';
import DebugLogDisplay from './DebugLogDisplay';
import DebugGameControls from './DebugGameControls';

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
    const { isDebug, addLog } = useDebug();

    const [game, setGame] = useState(null);
    const [team, setTeam] = useState(null);
    const [teamMembers, setTeamMembers] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

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
        return game?.startTime ? game.startTime.toDate() : undefined;
    }, [game?.startTime]);


    useEffect(() => {
        if (geoError) {
            console.error("Geolocation error:", geoError);
            addLog(`Geolocation Error: ${geoError.message}`);
        }
    }, [geoError, addLog]);

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
        if (game && !game.startTime && position && isLeader) {
            const startPoint = game.course?.startPoint || game.course?.start;
            if (!startPoint) return;

            const startLat = startPoint.latitude || startPoint.lat;
            const startLng = startPoint.longitude || startPoint.lng;
            const { latitude, longitude } = position.coords;

            const START_RADIUS = 20;
            const distance = calculateDistance(latitude, longitude, startLat, startLng);

            if (distance <= START_RADIUS) {
                const gameRef = doc(db, 'games', gameId);
                updateDoc(gameRef, {
                    startTime: serverTimestamp(),
                    status: 'started'
                }).then(() => {
                    addLog("Lagledaren nådde startpunkten. Spelet har startat!");
                }).catch(err => {
                    console.error("Kunde inte starta spelet:", err);
                });
            }
        }
    }, [position, game, team, user, gameId, addLog]);

    const completeObstacle = useCallback(async (obstacleId) => {
        if (!game || !obstacleId || game.completedObstacles.includes(obstacleId)) return;
        addLog(`Hinder "${obstacleId}" avklarat!`);
        const gameRef = doc(db, 'games', gameId);
        const currentObstacleIndex = game.course.obstacles.findIndex(o => o.obstacleId === obstacleId);
        const nextObstacleIndex = currentObstacleIndex + 1;
        
        if (nextObstacleIndex < game.course.obstacles.length) {
            const nextObstacle = game.course.obstacles[nextObstacleIndex];
            await updateDoc(gameRef, {
                completedObstacles: arrayUnion(obstacleId),
                activeObstacleId: nextObstacle.obstacleId,
            });
        } else {
            await updateDoc(gameRef, {
                completedObstacles: arrayUnion(obstacleId),
                activeObstacleId: null,
                status: 'finished',
                endTime: serverTimestamp(),
            });
            navigate(`/report/${gameId}`);
        }
    }, [game, gameId, addLog, navigate]);

    const checkObstacleProximity = useCallback((lat, lon) => {
        if (!game || !game.startTime || !game.activeObstacleId) return;

        const activeObstacle = game.course.obstacles.find(o => o.obstacleId === game.activeObstacleId);
        if (!activeObstacle) return;

        const obstacleLat = activeObstacle.location?.latitude || activeObstacle.lat;
        const obstacleLng = activeObstacle.location?.longitude || activeObstacle.lng;
        if (typeof obstacleLat !== 'number' || typeof obstacleLng !== 'number') return;
        
        const distance = calculateDistance(lat, lon, obstacleLat, obstacleLng);
        const obstacleRadius = activeObstacle.radius || 15;

        if (distance <= obstacleRadius) {
            completeObstacle(activeObstacle.obstacleId);
        }
    }, [game, completeObstacle]);

    useEffect(() => {
        if (!position || !game || !team || !user) return;
        const { latitude, longitude } = position.coords;

        const playerRef = doc(db, 'games', gameId, 'players', user.uid);
        setDoc(playerRef, {
            position: { latitude, longitude },
            lastUpdate: serverTimestamp()
        }, { merge: true }).catch(err => console.error("Kunde inte uppdatera position:", err));
        
        checkObstacleProximity(latitude, longitude);
    }, [position, game, team, user, gameId, checkObstacleProximity]);
    
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
        <div style={{ height: '100vh', width: '100vw' }} className="relative">
            <GameHeader 
                gameName={game.course.name}
                teamName={team.name}
                // Använder det memoiserade värdet
                startTime={startTimeDate}
            />
            <MapContainer center={center} zoom={15} ref={mapRef} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <Marker position={[startLat, startLng]} icon={startIcon}><Popup>Start</Popup></Marker>
                <Marker position={[finishLat, finishLng]} icon={finishIcon}><Popup>Mål</Popup></Marker>
                
                {game.course.obstacles.map(obstacle => (
                    <ObstacleMarker 
                        key={obstacle.obstacleId} 
                        obstacle={obstacle}
                        isCompleted={game.completedObstacles.includes(obstacle.obstacleId)}
                    />
                ))}

                {currentPosition && (
                    <Marker position={currentPosition} icon={user.uid === team?.leaderId ? leaderIcon : selfIcon}>
                        <Popup>Du {user.uid === team?.leaderId && '(Lagledare)'}</Popup>
                    </Marker>
                )}

                {teamMembers.filter(m => m.uid !== user.uid).map(member => (
                    <TeamMarker 
                        key={member.uid} 
                        member={member}
                        isLeader={member.uid === team?.leaderId}
                    />
                ))}
            </MapContainer>
            
            {isDebug && (
                <div className="absolute bottom-12 left-0 right-0 z-[1000] p-4 flex gap-4">
                    <DebugLogDisplay />
                    <DebugGameControls
                        onAdvanceSimulation={advanceSimulation}
                        simulationState={simulationState}
                        onCompleteObstacle={() => completeObstacle(game.activeObstacleId)}
                        game={game}
                    />
                </div>
            )}
        </div>
    );
};

export default GameScreen;