import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import useGeolocation from '../../hooks/useGeolocation';
import Spinner from '../shared/Spinner';

// Anpassade ikoner
const playerIcon = new L.Icon({
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', shadowSize: [41, 41]
});
const startIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const obstacleIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const finishIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

// Komponent för att justera kartvyn
const MapController = ({ center, zoom, bounds }) => {
    const map = useMap();
    useEffect(() => {
        if (bounds) {
            map.fitBounds(bounds);
        } else if (center && zoom) {
            map.setView(center, zoom);
        }
    }, [center, zoom, bounds, map]);
    return null;
};

const GameAreaOverlay = ({ center }) => {
    if (!center) return null;

    const radius = 100; // 100 meter
    const earthRadius = 6378137;
    const lat = center[0];
    const lng = center[1];

    const outerBounds = [
        [-90, -180],
        [90, -180],
        [90, 180],
        [-90, 180],
    ];

    const points = [];
    for (let i = 0; i < 360; i++) {
        const angle = i * (Math.PI / 180);
        const dLat = (radius / earthRadius) * (180 / Math.PI);
        const dLng = (radius / (earthRadius * Math.cos(lat * (Math.PI / 180)))) * (180 / Math.PI);
        points.push([lat + dLat * Math.sin(angle), lng + dLng * Math.cos(angle)]);
    }

    return (
        <Polygon
            positions={[outerBounds, points]}
            pathOptions={{ color: 'black', fillColor: 'black', fillOpacity: 0.4, stroke: false }}
        />
    );
};


const RiddleModal = ({ obstacle, onAnswer }) => {
    if (!obstacle || !Array.isArray(obstacle.options)) return null;

    return (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20">
            <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">Gåta!</h2>
                <p className="text-lg mb-6 text-gray-700">{obstacle.question}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {obstacle.options.map((option, index) => (
                        <button
                            key={index}
                            onClick={() => onAnswer(index)}
                            className="w-full p-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                        >
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
    const user = auth.currentUser;
    const { position, error: geoError, permissionDenied } = useGeolocation();

    const [game, setGame] = useState(null);
    const [course, setCourse] = useState(null);
    const [team, setTeam] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [timer, setTimer] = useState(0);
    const [showRiddle, setShowRiddle] = useState(false);
    const [currentRiddle, setCurrentRiddle] = useState(null);

    const gameRef = useRef(doc(db, 'games', gameId));

    useEffect(() => {
        const unsubscribe = onSnapshot(gameRef.current, async (docSnapshot) => {
            if (docSnapshot.exists()) {
                const gameData = { id: docSnapshot.id, ...docSnapshot.data() };
                setGame(gameData);

                if (gameData.status === 'finished') {
                    navigate(`/report/${gameId}`);
                }

                if (!course && gameData.courseId) {
                    const courseSnap = await getDoc(doc(db, 'courses', gameData.courseId));
                    if (courseSnap.exists()) {
                        const courseData = courseSnap.data();
                        setCourse(courseData);
                        if (gameData.solvedObstacles.length === 0 && courseData.obstacles && Array.isArray(courseData.obstacles)) {
                            await updateDoc(gameRef.current, {
                                solvedObstacles: Array(courseData.obstacles.length).fill(false),
                                solvedBy: [],
                                faultyObstacles: []
                            });
                        }
                    } else {
                        setError("Kunde inte hitta den valda banan.");
                    }
                }
                if (!team && gameData.teamId) {
                    const teamSnap = await getDoc(doc(db, 'teams', gameData.teamId));
                    if (teamSnap.exists()) setTeam(teamSnap.data());
                }
            } else {
                setError("Spelet hittades inte.");
                navigate('/teams');
            }
        }, (err) => {
            console.error("Error fetching game data:", err);
            setError("Kunde inte ladda speldata.");
            setLoading(false);
        });
        return () => unsubscribe();
    }, [gameId, navigate, course, team]);

    useEffect(() => {
        if (game && course && position && team) {
            setLoading(false);
        }
    }, [game, course, position, team]);

    useEffect(() => {
        if (position && user && game) {
            const playerPositions = { ...game.playerPositions, [user.uid]: { lat: position.latitude, lng: position.longitude } };
            updateDoc(gameRef.current, { playerPositions }).catch(err => console.error("Could not update player position", err));
        }
    }, [position, user, game]);
    
    // Hantera spellogik (start, hinder, mål)
    useEffect(() => {
        if (loading || !game || !course || !course.start || !position || game.status === 'finished') {
            return;
        }

        const playerPos = L.latLng(position.latitude, position.longitude);

        if (game.status === 'pending') {
            const startPos = L.latLng(course.start.lat, course.start.lng);
            if (playerPos.distanceTo(startPos) < 5) {
                updateDoc(gameRef.current, { status: 'started', startTime: new Date() });
            }
        }

        if (game.status === 'started') {
            const nextObstacleIndex = game.solvedObstacles.findIndex(solved => !solved);
            if (nextObstacleIndex !== -1) {
                // FIX: Kontrollera att hindret existerar i banan innan vi försöker komma åt det.
                if (nextObstacleIndex >= course.obstacles.length) {
                    console.warn(`Obstacle at index ${nextObstacleIndex} is missing from course definition. Skipping.`);
                    const newSolved = [...game.solvedObstacles];
                    newSolved[nextObstacleIndex] = true;
                    updateDoc(gameRef.current, { solvedObstacles: newSolved, faultyObstacles: arrayUnion(nextObstacleIndex) });
                    return; // Avbryt och vänta på nästa uppdatering
                }
                
                const obstacleOnCourse = course.obstacles[nextObstacleIndex];
                const obstaclePos = L.latLng(obstacleOnCourse.lat, obstacleOnCourse.lng);

                if (playerPos.distanceTo(obstaclePos) < 5) {
                    const fetchObstacleDetails = async () => {
                        const obstacleRef = doc(db, 'obstacles', obstacleOnCourse.obstacleId);
                        const obstacleSnap = await getDoc(obstacleRef);
                        if (obstacleSnap.exists()) {
                            setCurrentRiddle(obstacleSnap.data());
                            setShowRiddle(true);
                        } else {
                            console.warn(`Obstacle data for ID ${obstacleOnCourse.obstacleId} not found. Skipping.`);
                            const newSolved = [...game.solvedObstacles];
                            newSolved[nextObstacleIndex] = true;
                            updateDoc(gameRef.current, { solvedObstacles: newSolved, faultyObstacles: arrayUnion(nextObstacleIndex) });
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
                updateDoc(gameRef.current, { playersAtFinish: arrayUnion(user.uid) });
            }
        }

    }, [loading, game, course, position, user, navigate, showRiddle]);
    
    // Hantera timer
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

    // Kontrollera om spelet är vunnet
    useEffect(() => {
        if (game && course && team && game.status !== 'finished') {
            const allObstaclesSolved = game.solvedObstacles.every(s => s);
            const winConditionMet = game.isTestMode
                ? game.playersAtFinish.length >= 1
                : game.playersAtFinish.length === team.memberIds.length;

            if (allObstaclesSolved && winConditionMet) {
                updateDoc(gameRef.current, { status: 'finished', finishTime: new Date() });
            }
        }
    }, [game, course, team]);

    const handleAnswer = (selectedIndex) => {
        const nextObstacleIndex = game.solvedObstacles.findIndex(solved => !solved);
        if (selectedIndex === currentRiddle.correctAnswer) {
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

    if (loading || !course || !course.start) {
        return <div className="flex items-center justify-center h-screen"><Spinner /></div>;
    }

    if (error) {
        return <div className="text-center mt-10 text-red-500">{error}</div>;
    }

    const startPosition = [course.start.lat, course.start.lng];
    const gameAreaBounds = L.latLng(startPosition).toBounds(200); // 100m radie
    const nextObstacleIndex = game.solvedObstacles.findIndex(solved => !solved);
    const allObstaclesSolved = nextObstacleIndex === -1;

    const markers = [];
    if (course) {
        markers.push({ pos: [course.start.lat, course.start.lng], icon: startIcon, popup: "Start" });
        if (!allObstaclesSolved) {
            const obstacle = course.obstacles[nextObstacleIndex];
            if (obstacle && typeof obstacle.lat === 'number' && typeof obstacle.lng === 'number') {
                markers.push({ pos: [obstacle.lat, obstacle.lng], icon: obstacleIcon, popup: `Hinder ${nextObstacleIndex + 1}` });
            }
        }
        if (allObstaclesSolved && course.finish) {
            markers.push({ pos: [course.finish.lat, course.finish.lng], icon: finishIcon, popup: "Mål!" });
        }
    }
    
    if (position) {
        markers.push({ pos: [position.latitude, position.longitude], icon: playerIcon, popup: "Du är här" });
    }
    
    if (game.playerPositions) {
        Object.entries(game.playerPositions).forEach(([uid, pos]) => {
            if (uid !== user.uid && pos && typeof pos.lat === 'number' && typeof pos.lng === 'number') {
                markers.push({ pos: [pos.lat, pos.lng], icon: playerIcon, popup: "Lagkamrat" });
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
            {permissionDenied && <div className="bg-yellow-400 text-black p-2 text-center font-semibold">Platsåtkomst nekad. Använder fallback-position.</div>}
            {geoError && !permissionDenied && <div className="bg-red-500 text-white p-2 text-center font-semibold">Fel vid hämtning av position: {geoError}</div>}
            
            <div className="bg-gray-800 text-white p-4 flex justify-between items-center z-10">
                <h1 className="text-xl font-bold">{course.name}</h1>
                <div className="text-2xl font-mono">{formatTime(timer)}</div>
                <button onClick={() => navigate('/teams')} className="px-4 py-2 bg-red-600 rounded-md">Avsluta</button>
            </div>
            
            <div className="flex-grow">
                <MapContainer center={startPosition} zoom={15} scrollWheelZoom={true} className="h-full w-full">
                    <MapController bounds={gameAreaBounds} />
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <GameAreaOverlay center={startPosition} />
                    {markers.map((marker, idx) => (
                        <Marker key={idx} position={marker.pos} icon={marker.icon}>
                            <Popup>{marker.popup}</Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>
        </div>
    );
};

export default GameScreen;
