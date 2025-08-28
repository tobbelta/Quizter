import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, orderBy, getDocs, where, documentId } from 'firebase/firestore';
import { db } from '../../firebase';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, Polygon, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import Spinner from '../shared/Spinner';
import { startIcon, finishIcon, obstacleIcon, createPlayerIcon } from '../shared/MapIcons';

const playerColors = ['#4a90e2', '#f5a623', '#bd10e0', '#7e57c2', '#4a4a4a'];

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

const ReplayScreenV2 = () => {
    const { gameId } = useParams();
    const navigate = useNavigate();
    const [replayData, setReplayData] = useState(null);
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
        const fetchAllData = async () => {
            try {
                const gameSnap = await getDoc(doc(db, 'games', gameId));
                if (!gameSnap.exists()) throw new Error("Game not found");
                const game = gameSnap.data();

                const courseSnap = await getDoc(doc(db, 'courses', game.courseId));
                if (!courseSnap.exists()) throw new Error("Course not found");
                const course = courseSnap.data();
                
                const teamSnap = await getDoc(doc(db, 'teams', game.teamId));
                if (!teamSnap.exists()) throw new Error("Team not found");
                const teamData = teamSnap.data();

                const usersQuery = query(collection(db, 'users'), where(documentId(), 'in', teamData.memberIds));
                const usersSnapshot = await getDocs(usersQuery);
                const teamMembers = {};
                const playerIcons = {};
                usersSnapshot.forEach((doc, index) => {
                    teamMembers[doc.id] = doc.data();
                    playerIcons[doc.id] = createPlayerIcon(playerColors[index % playerColors.length]);
                });

                const pathQuery = query(collection(db, 'replays', gameId, 'path'), orderBy('timestamp', 'asc'));
                const pathSnap = await getDocs(pathQuery);
                const eventLog = pathSnap.docs.map(d => ({...d.data(), timestamp: d.data().timestamp.toDate()}));
                
                setReplayData({ game, course, eventLog, teamMembers, playerIcons });
            } catch (error) {
                console.error("Failed to load replay data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchAllData();
    }, [gameId]);

    const animate = useCallback((time) => {
        if (previousTimeRef.current !== undefined) {
            const deltaTime = time - previousTimeRef.current;
            setCurrentTime(prevTime => {
                const { game } = replayData;
                if (!game || !game.finishTime || !game.startTime) return prevTime;
                const totalDuration = game.finishTime.seconds - game.startTime.seconds;
                const newTime = prevTime + deltaTime * 0.001;
                if (newTime >= totalDuration) {
                    setIsPlaying(false);
                    return totalDuration;
                }
                return newTime;
            });
        }
        previousTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
    }, [replayData]);

    useEffect(() => {
        if (isPlaying) {
            requestRef.current = requestAnimationFrame(animate);
        }
        return () => cancelAnimationFrame(requestRef.current);
    }, [isPlaying, animate]);
    
    useEffect(() => {
        if (!replayData) return;
        const { game, eventLog, course } = replayData;
        if (!game.startTime || eventLog.length === 0) return;
        
        const gameStartTime = game.startTime.seconds * 1000;
        const currentAbsoluteTime = gameStartTime + (currentTime * 1000);

        const newPositions = {};
        const newSolved = [];
        let newActiveIndex = 0;
        
        const pastEvents = eventLog.filter(e => e.timestamp && e.timestamp.getTime() <= currentAbsoluteTime);

        pastEvents.forEach(event => {
            if (event.type === 'move') newPositions[event.userId] = { lat: event.lat, lng: event.lng };
            if (event.type === 'obstacleSolved' && !newSolved.includes(event.obstacleIndex)) {
                newSolved.push(event.obstacleIndex);
                setFeedbackEvent({ type: 'solve', index: event.obstacleIndex, time: Date.now() });
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

    }, [currentTime, replayData]);

    const gameBounds = useMemo(() => {
        if (!replayData) return null;
        const { course } = replayData;
        const points = [
            [course.start.lat, course.start.lng],
            [course.finish.lat, course.finish.lng],
            ...course.obstacles.map(o => [o.lat, o.lng])
        ];
        return L.latLngBounds(points).pad(0.2);
    }, [replayData]);

    if (loading) {
        return <div className="flex items-center justify-center h-screen"><Spinner /></div>;
    }
    
    if (!replayData) {
        return <div className="text-center mt-10">Kunde inte ladda reprisdata.</div>;
    }

    const { game, course, teamMembers, playerIcons, eventLog } = replayData;
    const totalDuration = game.finishTime.seconds - game.startTime.seconds;

    return (
        <div className="h-screen w-screen flex flex-col">
            <div className="soft-ui-card m-4 z-10">
                <div className="flex justify-between items-center">
                    <h1 className="text-xl font-bold">Repris: {course.name}</h1>
                    <button onClick={() => navigate(-1)} className="soft-ui-button">Tillbaka</button>
                </div>
                <div className="flex items-center gap-4 mt-2">
                    <button onClick={() => setIsPlaying(!isPlaying)} className="soft-ui-button soft-ui-button-primary">{isPlaying ? 'Pausa' : 'Spela'}</button>
                    <input type="range" min="0" max={totalDuration} value={currentTime} onChange={e => setCurrentTime(Number(e.target.value))} className="w-full" />
                </div>
            </div>
            <div className="flex-grow relative -mt-24 pt-24">
                <MapContainer center={[course.start.lat, course.start.lng]} zoom={16} className="h-full w-full" zoomControl={false}>
                    <MapController bounds={gameBounds} />
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <ZoomControl position="bottomleft" />
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
                <div className="absolute bottom-4 left-4 z-[1000] bg-white bg-opacity-80 p-3 rounded-lg shadow-lg w-80 h-48 overflow-y-auto soft-ui-card">
                    <p className="font-bold border-b border-gray-300 pb-1 mb-2">HÄNDELSELOGG</p>
                    {eventLog.filter(e => e.timestamp.getTime() <= (game.startTime.seconds * 1000 + currentTime * 1000)).map((e, i) => (
                        <p key={i} className="text-xs">{`> ${e.type} by ${teamMembers[e.userId]?.displayName}`}</p>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ReplayScreenV2;

