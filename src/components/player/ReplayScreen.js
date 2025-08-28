import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, orderBy, getDocs, where, documentId } from 'firebase/firestore';
import { db } from '../../firebase';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, Polygon } from 'react-leaflet';
import L from 'leaflet';
import Spinner from '../shared/Spinner';

const createPlayerIcon = (color) => new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', shadowSize: [41, 41]
});

const playerColors = ['blue', 'gold', 'violet', 'grey', 'black'];
const startIcon = createPlayerIcon('green');
const obstacleIcon = createPlayerIcon('orange');
const finishIcon = createPlayerIcon('red');

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


const ReplayScreen = () => {
    const { gameId } = useParams();
    const navigate = useNavigate();
    const [game, setGame] = useState(null);
    const [course, setCourse] = useState(null);
    const [eventLog, setEventLog] = useState([]);
    const [teamMembers, setTeamMembers] = useState({});
    const [playerIcons, setPlayerIcons] = useState({});
    const [loading, setLoading] = useState(true);
    const [playerPositions, setPlayerPositions] = useState({});
    const [solvedObstacles, setSolvedObstacles] = useState([]);
    const [activeObstacleIndex, setActiveObstacleIndex] = useState(0);
    const [feedbackEvent, setFeedbackEvent] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const requestRef = useRef();
    const previousTimeRef = useRef();

    useEffect(() => {
        const fetchGameData = async () => {
            const gameSnap = await getDoc(doc(db, 'games', gameId));
            if (gameSnap.exists()) {
                const gameData = gameSnap.data();
                setGame(gameData);
                const courseSnap = await getDoc(doc(db, 'courses', gameData.courseId));
                if (courseSnap.exists()) setCourse(courseSnap.data());
                
                const teamSnap = await getDoc(doc(db, 'teams', gameData.teamId));
                if (teamSnap.exists()) {
                    const teamData = teamSnap.data();
                    const usersQuery = query(collection(db, 'users'), where(documentId(), 'in', teamData.memberIds));
                    const usersSnapshot = await getDocs(usersQuery);
                    const membersMap = {};
                    const iconsMap = {};
                    usersSnapshot.forEach((doc, index) => {
                        membersMap[doc.id] = doc.data();
                        iconsMap[doc.id] = createPlayerIcon(playerColors[index % playerColors.length]);
                    });
                    setTeamMembers(membersMap);
                    setPlayerIcons(iconsMap);
                }

                const pathQuery = query(collection(db, 'replays', gameId, 'path'), orderBy('timestamp', 'asc'));
                const pathSnap = await getDocs(pathQuery);
                const paths = pathSnap.docs.map(d => ({...d.data(), timestamp: d.data().timestamp.toDate()}));
                setEventLog(paths);
            }
            setLoading(false);
        };
        fetchGameData();
    }, [gameId]);

    const animate = useCallback((time) => {
        if (previousTimeRef.current !== undefined) {
            const deltaTime = time - previousTimeRef.current;
            setCurrentTime(prevTime => {
                if (!game || !game.finishTime || !game.startTime) return prevTime;
                const totalDuration = game.finishTime.seconds - game.startTime.seconds;
                const newTime = prevTime + deltaTime * 0.001; // Ta bort playbackSpeed
                if (newTime >= totalDuration) {
                    setIsPlaying(false);
                    return totalDuration;
                }
                return newTime;
            });
        }
        previousTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
    }, [game]);

    useEffect(() => {
        if (isPlaying) {
            requestRef.current = requestAnimationFrame(animate);
        }
        return () => cancelAnimationFrame(requestRef.current);
    }, [isPlaying, animate]);
    
    useEffect(() => {
        if (!game || !game.startTime || eventLog.length === 0 || !course) return;
        
        const gameStartTime = game.startTime.seconds * 1000;
        const currentAbsoluteTime = gameStartTime + (currentTime * 1000);

        const newPositions = {};
        const newSolved = [];
        let newActiveIndex = 0;
        
        const pastEvents = eventLog.filter(e => e.timestamp && e.timestamp.getTime() <= currentAbsoluteTime);

        pastEvents.forEach(event => {
            if (event.type === 'move') {
                newPositions[event.userId] = { lat: event.lat, lng: event.lng };
            }
            if (event.type === 'obstacleSolved') {
                if (!newSolved.includes(event.obstacleIndex)) {
                    newSolved.push(event.obstacleIndex);
                    setFeedbackEvent({ type: 'solve', index: event.obstacleIndex, time: Date.now() });
                }
            }
        });
        
        setPlayerPositions(newPositions);
        setSolvedObstacles(newSolved);

        for (let i = 0; i < course.obstacles.length; i++) {
            if (!newSolved.includes(i)) {
                newActiveIndex = i;
                break;
            }
            if (i === course.obstacles.length - 1) newActiveIndex = -1;
        }
        setActiveObstacleIndex(newActiveIndex);

    }, [currentTime, game, eventLog, course]);

    const gameBounds = useMemo(() => {
        if (!course) return null;
        const points = [
            [course.start.lat, course.start.lng],
            [course.finish.lat, course.finish.lng],
            ...course.obstacles.map(o => [o.lat, o.lng])
        ];
        return L.latLngBounds(points).pad(0.2);
    }, [course]);

    if (loading || !course || !game || Object.keys(teamMembers).length === 0 || Object.keys(playerIcons).length === 0) {
        return <div className="flex items-center justify-center h-screen"><Spinner /></div>;
    }
    
    const totalDuration = game.finishTime.seconds - game.startTime.seconds;

    return (
        <div className="h-screen w-screen flex flex-col">
            <div className="bg-gray-800 text-white p-4 z-10">
                <div className="flex justify-between items-center">
                    <h1 className="text-xl font-bold">Repris: {course.name}</h1>
                    <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700">
                        Tillbaka till Rapport
                    </button>
                </div>
                <div className="flex items-center gap-4 mt-2">
                    <button onClick={() => setIsPlaying(!isPlaying)} className="px-4 py-2 bg-blue-600 rounded-md">{isPlaying ? 'Pausa' : 'Spela'}</button>
                    <input type="range" min="0" max={totalDuration} value={currentTime} onChange={e => setCurrentTime(Number(e.target.value))} className="w-full" />
                </div>
            </div>
            <div className="flex-grow relative">
                <MapContainer center={[course.start.lat, course.start.lng]} zoom={16} className="h-full w-full">
                    <MapController bounds={gameBounds} />
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <GameAreaOverlay center={[course.start.lat, course.start.lng]} radius={100} />
                    
                    <Marker position={[course.start.lat, course.start.lng]} icon={startIcon}><Popup>Start</Popup></Marker>
                    {course.obstacles.map((obs, index) => (
                        <Marker key={`obs-${index}`} position={[obs.lat, obs.lng]} icon={obstacleIcon} opacity={solvedObstacles.includes(index) ? 0.5 : 1}>
                            <Popup>Hinder {index + 1}</Popup>
                            {activeObstacleIndex === index && <Circle center={[obs.lat, obs.lng]} radius={15} pathOptions={{ color: 'yellow', fillOpacity: 0.3 }} />}
                            {feedbackEvent?.type === 'solve' && feedbackEvent.index === index && <Circle center={[obs.lat, obs.lng]} radius={20} pathOptions={{ color: 'green', fillOpacity: 0.5 }} />}
                        </Marker>
                    ))}
                    <Marker position={[course.finish.lat, course.finish.lng]} icon={finishIcon}><Popup>Mål</Popup></Marker>

                    {Object.entries(playerPositions).map(([userId, pos]) => (
                        <Marker key={userId} position={[pos.lat, pos.lng]} icon={playerIcons[userId] || createPlayerIcon('grey')}>
                            <Popup>{teamMembers[userId]?.displayName || 'Okänd'}</Popup>
                        </Marker>
                    ))}
                </MapContainer>
                <div className="absolute bottom-4 left-4 z-[1000] bg-black bg-opacity-70 text-white text-xs font-mono p-3 rounded-lg shadow-lg w-80 h-48 overflow-y-auto">
                    <p className="text-green-400 border-b border-gray-600 pb-1 mb-2">HÄNDELSELOGG</p>
                    {eventLog.filter(e => e.timestamp.getTime() <= (game.startTime.seconds * 1000 + currentTime * 1000)).map((e, i) => (
                        <p key={i}>{`> ${e.type} by ${teamMembers[e.userId]?.displayName}`}</p>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ReplayScreen;
