import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, arrayUnion, getDoc, collection, addDoc, query, where, documentId, getDocs } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polygon, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import useGeolocation from '../../hooks/useGeolocation';
import Spinner from '../shared/Spinner';
import DebugGameControls from './DebugGameControls';
import DebugLogDisplay from './DebugLogDisplay';
import { startIcon, finishIcon, obstacleIcon, selfIcon, teammateIcon } from '../shared/MapIcons';
import Logo from '../shared/Logo';


const GeolocationStatus = ({ status }) => {
    let message = 'Väntar på GPS-signal...';
    if (status === 'denied') {
        message = 'Du måste godkänna platstjänster för att spela.';
    }

    return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-background">
            <div className="neu-card text-center">
                <p className="text-lg font-semibold mb-4">{message}</p>
                <Spinner />
            </div>
        </div>
    );
};

const MapController = ({ bounds }) => {
    const map = useMap();
    useEffect(() => {
        if (bounds) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [bounds, map]);
    return null;
};

const GameAreaOverlay = ({ center, radius }) => {
    if (!center) return null;
    const earthRadius = 6378137;
    const lat = center[0];
    const outerBounds = [[-90, -180], [90, -180], [90, 180], [-90, 180]];
    const points = [];
    for (let i = 0; i < 360; i++) {
        const angle = i * (Math.PI / 180);
        const dLat = (radius / earthRadius) * (180 / Math.PI);
        const dLng = (radius / (earthRadius * Math.cos(lat * Math.PI / 180))) * (180 / Math.PI);
        points.push([lat + dLat * Math.sin(angle), center[1] + dLng * Math.cos(angle)]);
    }
    return <Polygon positions={[outerBounds, points]} pathOptions={{ color: 'black', fillColor: 'black', fillOpacity: 0.4, stroke: false }} />;
};

const RiddleModal = ({ obstacle, onAnswer }) => {
    if (!obstacle || !Array.isArray(obstacle.options)) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[1001] p-4">
            <div className="soft-ui-card w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4 text-gray-700">Gåta!</h2>
                <p className="text-lg mb-6">{obstacle.question}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {obstacle.options.map((option, index) => (
                        <button key={index} onClick={() => onAnswer(index)} className="soft-ui-button soft-ui-button-primary w-full">
                            {option}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

const GameScreen = () => {
    const { gameId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const user = auth.currentUser;
    const { position, status: geoStatus } = useGeolocation();

    const [game, setGame] = useState(null);
    const [course, setCourse] = useState(null);
    const [team, setTeam] = useState(null);
    const [teamMembers, setTeamMembers] = useState({});
    const [loading, setLoading] = useState(true);
    const [logHistory, setLogHistory] = useState([]);
    const [simulatedPosition, setSimulatedPosition] = useState(null);
    const [timer, setTimer] = useState(0);
    const [showRiddle, setShowRiddle] = useState(false);
    const [currentRiddle, setCurrentRiddle] = useState(null);

    const gameRef = useRef(doc(db, 'games', gameId));
    const finalPosition = simulatedPosition || position;
    const lastLoggedPositionRef = useRef(null);

    const addLogMessage = (message) => {
        if (process.env.NODE_ENV === 'development') {
            const timestamp = new Date().toLocaleTimeString();
            setLogHistory(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 100));
        }
    };

    const getRandomCoordinate = (startCoords, radiusInMeters) => {
        const r = radiusInMeters * Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const dy = r * Math.sin(theta);
        const dx = r * Math.cos(theta);
        const newLat = startCoords.lat + dy / 111132;
        const newLng = startCoords.lng + dx / (111320 * Math.cos(startCoords.lat * Math.PI / 180));
        return { lat: newLat, lng: newLng };
    };

    useEffect(() => {
        const unsubscribe = onSnapshot(gameRef.current, async (docSnapshot) => {
            if (docSnapshot.exists()) {
                const gameData = { id: docSnapshot.id, ...docSnapshot.data() };
                setGame(gameData);
                if (gameData.status === 'finished') {
                    navigate(`/report/${gameId}`);
                    return;
                }
                if (!course && gameData.courseId) {
                    const courseSnap = await getDoc(doc(db, 'courses', gameData.courseId));
                    if (courseSnap.exists()) setCourse(courseSnap.data());
                }
                if (!team && gameData.teamId) {
                    const teamSnap = await getDoc(doc(db, 'teams', gameData.teamId));
                    if (teamSnap.exists()) {
                        const teamData = teamSnap.data();
                        setTeam(teamData);
                        const usersQuery = query(collection(db, 'users'), where(documentId(), 'in', teamData.memberIds));
                        const usersSnapshot = await getDocs(usersQuery);
                        const membersMap = {};
                        usersSnapshot.forEach(doc => membersMap[doc.id] = doc.data());
                        setTeamMembers(membersMap);
                    }
                }
            } else {
                navigate('/teams');
            }
        });
        return () => unsubscribe();
    }, [gameId, navigate, course, team]);

    useEffect(() => {
        if (location.state?.randomizePosition && course && user && !simulatedPosition) {
            const randomPos = getRandomCoordinate(course.start, 90);
            setSimulatedPosition({ latitude: randomPos.lat, longitude: randomPos.lng });
        }
    }, [course, user, location.state, simulatedPosition]);

    useEffect(() => {
        if (game && course && team && Object.keys(teamMembers).length > 0) {
            setLoading(false);
        }
    }, [game, course, team, teamMembers]);

    useEffect(() => {
        if (!finalPosition || !user || !game) return;
        const currentPos = L.latLng(finalPosition.latitude, finalPosition.longitude);
        const playerPositions = { ...game.playerPositions, [user.uid]: { lat: finalPosition.latitude, lng: finalPosition.longitude } };
        updateDoc(gameRef.current, { playerPositions });
        if (game.status === 'started') {
            const lastLoggedPos = lastLoggedPositionRef.current;
            if (!lastLoggedPos || currentPos.distanceTo(lastLoggedPos) > 5) {
                const pathData = { type: 'move', userId: user.uid, lat: finalPosition.latitude, lng: finalPosition.longitude, timestamp: new Date() };
                const replayPathRef = collection(db, 'replays', gameId, 'path');
                addDoc(replayPathRef, pathData).then(() => {
                    lastLoggedPositionRef.current = currentPos;
                    addLogMessage(`Logged coords for ${teamMembers[user.uid]?.displayName || user.uid.substring(0,6)}`);
                });
            }
        }
    }, [finalPosition, user, game, gameId, teamMembers]);
    
    useEffect(() => {
        if (loading || !game || !course || !course.start || !finalPosition || game.status === 'finished') return;
        const playerPos = L.latLng(finalPosition.latitude, finalPosition.longitude);
        if (game.status === 'pending') {
            const startPos = L.latLng(course.start.lat, course.start.lng);
            if (playerPos.distanceTo(startPos) < 5) {
                const updateData = { status: 'started', startTime: new Date() };
                if (process.env.NODE_ENV === 'development' && team && team.memberIds) {
                    const initialPositions = {};
                    team.memberIds.forEach((memberId) => {
                        initialPositions[memberId] = getRandomCoordinate(course.start, 90);
                    });
                    updateData.playerPositions = initialPositions;
                }
                updateDoc(gameRef.current, updateData);
            }
        }
        if (game.status === 'started') {
            const nextObstacleIndex = game.solvedObstacles.findIndex(solved => !solved);
            if (nextObstacleIndex !== -1) {
                if (nextObstacleIndex >= course.obstacles.length) return;
                const obstacleOnCourse = course.obstacles[nextObstacleIndex];
                const obstaclePos = L.latLng(obstacleOnCourse.lat, obstacleOnCourse.lng);
                if (playerPos.distanceTo(obstaclePos) < 5) {
                    const fetchObstacleDetails = async () => {
                        const obstacleRef = doc(db, 'obstacles', obstacleOnCourse.obstacleId);
                        const obstacleSnap = await getDoc(obstacleRef);
                        if (obstacleSnap.exists()) {
                            setCurrentRiddle(obstacleSnap.data());
                            setShowRiddle(true);
                        }
                    };
                    if (!showRiddle) fetchObstacleDetails();
                } else {
                    setShowRiddle(false);
                }
            }
        }
        const allObstaclesSolved = game.solvedObstacles.every(solved => solved);
        if (allObstaclesSolved && course.finish) {
            const finishPos = L.latLng(course.finish.lat, course.finish.lng);
            if (playerPos.distanceTo(finishPos) < 5 && !game.playersAtFinish.includes(user.uid)) {
                addLogMessage(`${teamMembers[user.uid]?.displayName} reached the finish line!`);
                updateDoc(gameRef.current, { playersAtFinish: arrayUnion(user.uid) });
            }
        }
    }, [loading, game, course, finalPosition, user, navigate, showRiddle, team, teamMembers]);
    
    useEffect(() => {
        let interval;
        if (game?.status === 'started' && game.startTime) {
            interval = setInterval(() => {
                const now = new Date();
                const start = game.startTime.toDate();
                setTimer(Math.floor((now - start) / 1000));
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [game]);

    useEffect(() => {
        if (game && course && team && game.status !== 'finished') {
            const allObstaclesSolved = game.solvedObstacles.every(s => s);
            const winConditionMet = game.isTestMode ? game.playersAtFinish.length >= 1 : game.playersAtFinish.length === team.memberIds.length;
            if (allObstaclesSolved && winConditionMet) {
                updateDoc(gameRef.current, { status: 'finished', finishTime: new Date() });
            }
        }
    }, [game, course, team]);

    const handleAnswer = (selectedIndex) => {
        const nextObstacleIndex = game.solvedObstacles.findIndex(solved => !solved);
        if (selectedIndex === currentRiddle.correctAnswer) {
            addLogMessage(`${teamMembers[user.uid]?.displayName} solved obstacle ${nextObstacleIndex + 1}.`);
            const replayEventRef = collection(db, 'replays', gameId, 'path');
            addDoc(replayEventRef, {
                type: 'obstacleSolved',
                userId: user.uid,
                obstacleIndex: nextObstacleIndex,
                timestamp: new Date()
            });
            const newSolved = [...game.solvedObstacles];
            newSolved[nextObstacleIndex] = true;
            updateDoc(gameRef.current, { 
                solvedObstacles: newSolved,
                solvedBy: arrayUnion({ obstacleIndex: nextObstacleIndex, userId: user.uid })
            }).then(() => {
                setShowRiddle(false);
                setCurrentRiddle(null);
            });
        } else {
            alert("Fel svar, försök igen!");
        }
    };

    const gameBounds = useMemo(() => {
        if (!course) return null;

        const coursePoints = [
            [course.start.lat, course.start.lng],
            [course.finish.lat, course.finish.lng],
            ...course.obstacles.map(o => [o.lat, o.lng])
        ];
        let bounds = L.latLngBounds(coursePoints);

        if (finalPosition) {
            const playerLatLng = L.latLng(finalPosition.latitude, finalPosition.longitude);
            if (!bounds.contains(playerLatLng)) {
                bounds.extend(playerLatLng);
            }
        }
        
        return bounds.pad(0.5);
    }, [course, finalPosition]);

    if (loading) {
        return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;
    }
    
    const startPosition = [course.start.lat, course.start.lng];
    const nextObstacleIndex = game.solvedObstacles.findIndex(solved => !solved);
    const allObstaclesSolved = nextObstacleIndex === -1;
    const markers = [];
    if (course) {
        markers.push({ pos: [course.start.lat, course.start.lng], icon: startIcon, popup: "Start" });
        if (!allObstaclesSolved) {
            const obstacle = course.obstacles[nextObstacleIndex];
            if (obstacle) markers.push({ pos: [obstacle.lat, obstacle.lng], icon: obstacleIcon, popup: `Hinder ${nextObstacleIndex + 1}` });
        }
        if (allObstaclesSolved && course.finish) {
            markers.push({ pos: [course.finish.lat, course.finish.lng], icon: finishIcon, popup: "Mål!" });
        }
    }
    if (finalPosition) {
        markers.push({ pos: [finalPosition.latitude, finalPosition.longitude], icon: selfIcon, popup: "Du är här" });
    }
    if (game.playerPositions) {
        Object.entries(game.playerPositions).forEach(([uid, pos]) => {
            if (uid !== user.uid && pos) {
                const memberName = teamMembers[uid]?.displayName || 'Lagkamrat';
                markers.push({ pos: [pos.lat, pos.lng], icon: teammateIcon, popup: memberName });
            }
        });
    }
    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    return (
        <div className="h-screen w-screen flex flex-col relative">
            {showRiddle && <RiddleModal obstacle={currentRiddle} onAnswer={handleAnswer} />}
            <div className="absolute top-0 left-0 right-0 p-3 z-[1000] flex justify-between items-center bg-black/60 backdrop-blur-sm">
                 <div className="flex items-center gap-3">
                    <Logo size={40} />
                    <h1 className="text-lg font-bold text-white truncate" style={{ textShadow: '1px 1px 2px black' }}>{course.name}</h1>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-3 py-1 bg-black/50 text-white rounded-lg text-xl font-mono">{formatTime(timer)}</div>
                    <button 
                        onClick={() => navigate('/teams')} 
                        className="sc-button sc-button-red !p-2 !rounded-full w-10 h-10 flex items-center justify-center"
                        aria-label="Avsluta spel"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            </div>
            <div className="flex-grow">
                {finalPosition ? (
                    <MapContainer center={[finalPosition.latitude, finalPosition.longitude]} zoom={15} scrollWheelZoom={true} className="h-full w-full" zoomControl={false}>
                        <MapController bounds={gameBounds} />
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <ZoomControl position="bottomleft" />
                        <GameAreaOverlay center={startPosition} radius={100} />
                        {markers.map((marker, idx) => (
                            <Marker key={idx} position={marker.pos} icon={marker.icon}>
                                <Popup>{marker.popup}</Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                ) : (
                    <GeolocationStatus status={geoStatus} />
                )}
            </div>
            <DebugGameControls 
                game={game} 
                course={course} 
                team={team} 
                user={user} 
                gameId={gameId}
                onSimulatePosition={setSimulatedPosition}
                addLogMessage={addLogMessage}
            />
            <DebugLogDisplay messages={logHistory} />
        </div>
    );
};

export default GameScreen;