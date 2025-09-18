import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, getDoc, collection, query, where, documentId, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polygon, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import Spinner from '../shared/Spinner';
import Header from '../shared/Header';
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

const SpectateScreen = ({ user, userData }) => {
    const { gameId } = useParams();
    const navigate = useNavigate();
    const [game, setGame] = useState(null);
    const [course, setCourse] = useState(null);
    const [team, setTeam] = useState(null);
    const [teamMembers, setTeamMembers] = useState({});
    const [playerIcons, setPlayerIcons] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const gameRef = doc(db, 'games', gameId);
        const unsubscribe = onSnapshot(gameRef, async (docSnapshot) => {
            if (docSnapshot.exists()) {
                const gameData = { id: docSnapshot.id, ...docSnapshot.data() };
                setGame(gameData);

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
                        const iconsMap = {};
                        usersSnapshot.forEach((doc, index) => {
                            membersMap[doc.id] = doc.data();
                            iconsMap[doc.id] = createPlayerIcon(playerColors[index % playerColors.length]);
                        });
                        setTeamMembers(membersMap);
                        setPlayerIcons(iconsMap);
                    }
                }
            } else {
                navigate('/gamemaster');
            }
        });
        return () => unsubscribe();
    }, [gameId, course, team, navigate]);

    useEffect(() => {
        if (game && course && team && Object.keys(teamMembers).length > 0) {
            setLoading(false);
        }
    }, [game, course, team, teamMembers]);

    const gameBounds = useMemo(() => {
        if (!course || !course.start || !course.finish) return null;
        const points = [
            [course.start.lat, course.start.lng],
            [course.finish.lat, course.finish.lng]
        ];

        // Lägg till obstacles bara om de har giltiga koordinater
        if (course.obstacles && Array.isArray(course.obstacles)) {
            course.obstacles.forEach(o => {
                if (o && typeof o.lat === 'number' && typeof o.lng === 'number') {
                    points.push([o.lat, o.lng]);
                }
            });
        }

        return points.length >= 2 ? L.latLngBounds(points).pad(0.2) : null;
    }, [course]);

    if (loading) {
        return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;
    }


    return (
        <div className="h-screen w-screen flex flex-col">
            <Header title={`Åskådar: ${team.name}`} user={user} userData={userData}>
                 <button onClick={() => navigate('/gm')} className="sc-button">Tillbaka</button>
            </Header>
            <div className="flex-grow relative -mt-16 pt-16">
                <MapContainer center={course.start && course.start.lat && course.start.lng ? [course.start.lat, course.start.lng] : [59.3293, 18.0686]} zoom={16} scrollWheelZoom={true} className="h-full w-full" zoomControl={false}>
                    <MapController bounds={gameBounds} />
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <ZoomControl position="bottomleft" />
                    {course.start && course.start.lat && course.start.lng && (
                        <GameAreaOverlay center={[course.start.lat, course.start.lng]} radius={100} />
                    )}
                    
                    {course.start && course.start.lat && course.start.lng && (
                        <Marker position={[course.start.lat, course.start.lng]} icon={startIcon}><Popup>Start</Popup></Marker>
                    )}

                    {/* Visa bara aktivt hinder */}
                    {game.activeObstacleId && course.obstacles && Array.isArray(course.obstacles) &&
                        course.obstacles
                            .filter(obs => obs.obstacleId === game.activeObstacleId)
                            .map((obs, index) => {
                                if (obs && typeof obs.lat === 'number' && typeof obs.lng === 'number') {
                                    return (
                                        <Marker key={`active-obs-${obs.obstacleId}`} position={[obs.lat, obs.lng]} icon={obstacleIcon}>
                                            <Popup>Aktivt hinder: {obs.obstacleId}</Popup>
                                        </Marker>
                                    );
                                }
                                return null;
                            })
                    }

                    {/* Visa klarade hinder med halvtransparens */}
                    {game.completedObstacles && course.obstacles && Array.isArray(course.obstacles) &&
                        course.obstacles
                            .filter(obs => game.completedObstacles.includes(obs.obstacleId))
                            .map((obs) => {
                                if (obs && typeof obs.lat === 'number' && typeof obs.lng === 'number') {
                                    return (
                                        <Marker key={`completed-obs-${obs.obstacleId}`} position={[obs.lat, obs.lng]} icon={obstacleIcon} opacity={0.5}>
                                            <Popup>Klarat hinder: {obs.obstacleId}</Popup>
                                        </Marker>
                                    );
                                }
                                return null;
                            })
                    }

                    {/* Visa mål bara när alla hinder är klarade */}
                    {!game.activeObstacleId && game.completedObstacles?.length > 0 &&
                     course.finish && course.finish.lat && course.finish.lng && (
                        <Marker position={[course.finish.lat, course.finish.lng]} icon={finishIcon}><Popup>Mål</Popup></Marker>
                    )}

                    {game.playerPositions && Object.entries(game.playerPositions).map(([uid, pos]) => (
                        <Marker key={`player-${uid}`} position={[pos.lat, pos.lng]} icon={playerIcons[uid] || createPlayerIcon('grey')}>
                            <Popup>{teamMembers[uid]?.displayName || 'Okänd spelare'}</Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>
        </div>
    );
};

export default SpectateScreen;

