import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
// **KORRIGERING:** Tar bort oanvända 'serverTimestamp' från importen.
import { doc, onSnapshot, collection, getDocs, addDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import Spinner from '../shared/Spinner';
import Header from '../shared/Header';
import { useDebug } from '../../context/DebugContext';
import { debugLog } from '../../utils/logger';

const calculateBounds = (course) => {
    const points = [];
    const startPoint = course.startPoint || course.start;
    const finishPoint = course.finishPoint || course.finish;

    if (startPoint) points.push({ lat: startPoint.latitude || startPoint.lat, lng: startPoint.longitude || startPoint.lng });
    if (finishPoint) points.push({ lat: finishPoint.latitude || finishPoint.lat, lng: finishPoint.longitude || finishPoint.lng });

    if (course.obstacles && Array.isArray(course.obstacles)) {
        course.obstacles.forEach(o => {
            const lat = o.location?.latitude || o.lat;
            const lng = o.location?.longitude || o.lng;
            if (typeof lat === 'number' && typeof lng === 'number') {
                points.push({ lat, lng });
            }
        });
    }

    if (points.length === 0) return null;

    const latitudes = points.map(p => p.lat);
    const longitudes = points.map(p => p.lng);

    return {
        minLat: Math.min(...latitudes),
        maxLat: Math.max(...latitudes),
        minLng: Math.min(...longitudes),
        maxLng: Math.max(...longitudes),
    };
};


const Lobby = ({ user, userData }) => {
    const { gameId: teamId } = useParams();
    const navigate = useNavigate();
    const { isDebug } = useDebug();

    const [team, setTeam] = useState(null);
    const [courses, setCourses] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState('');
    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!teamId) return;

        let unsubscribeGame = () => {};
        const teamRef = doc(db, 'teams', teamId);
        
        const unsubscribeTeam = onSnapshot(teamRef, (teamDoc) => {
            if (!teamDoc.exists()) {
                setError("Laget hittades inte.");
                setLoading(false);
                return;
            }

            const teamData = { id: teamDoc.id, ...teamDoc.data() };
            setTeam(teamData);
            unsubscribeGame();

            if (teamData.currentGameId) {
                const gameRef = doc(db, 'games', teamData.currentGameId);
                unsubscribeGame = onSnapshot(gameRef, (gameDoc) => {
                    setGame(gameDoc.exists() ? { id: gameDoc.id, ...gameDoc.data() } : null);
                    setLoading(false);
                });
            } else {
                setGame(null);
                setLoading(false);
            }
        });

        const fetchCourses = async () => {
            try {
                const coursesCollection = collection(db, 'courses');
                const courseSnapshot = await getDocs(coursesCollection);
                const courseList = courseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setCourses(courseList);
                if (courseList.length > 0) {
                    setSelectedCourse(courseList[0].id);
                }
            } catch (err) {
                console.error("Kunde inte hämta banor:", err);
                setError("Kunde inte ladda tillgängliga banor.");
            }
        };

        fetchCourses();

        return () => {
            unsubscribeTeam();
            unsubscribeGame();
        };
    }, [teamId]);
    
    const handleCreateGame = async () => {
        if (!selectedCourse) {
            setError("Vänligen välj en bana.");
            return;
        }

        const courseData = courses.find(c => c.id === selectedCourse);
        if (!courseData) {
            setError("Vald bana är ogiltig.");
            return;
        }

        try {
            debugLog(isDebug, "LOBBY: Vald bandata", courseData);
            const bounds = calculateBounds(courseData);
            debugLog(isDebug, "LOBBY: Beräknade bounds", bounds);

            if (!bounds) {
                throw new Error("Kunde inte beräkna spelområdets gränser. Kontrollera att banan har start/slut/hinder-punkter.");
            }
            
            const enrichedCourseData = { ...courseData, bounds };

            const newGame = {
                teamId: team.id,
                course: enrichedCourseData,
                status: 'created',
                startTime: null,
                endTime: null,
                completedObstacles: [],
                activeObstacleId: courseData.obstacles[0]?.obstacleId || null,
            };
            
            debugLog(isDebug, "LOBBY: Objekt som sparas i databasen", newGame);
            
            const gameDocRef = await addDoc(collection(db, 'games'), newGame);
            
            const playerCreationPromises = team.memberIds.map(memberId => {
                const playerDocRef = doc(db, 'games', gameDocRef.id, 'players', memberId);
                return setDoc(playerDocRef, {
                    uid: memberId,
                    position: null,
                    lastUpdate: null
                });
            });
            await Promise.all(playerCreationPromises);

            const teamRef = doc(db, 'teams', team.id);
            await updateDoc(teamRef, { currentGameId: gameDocRef.id });

        } catch (err) {
            console.error(err);
            setError(`Kunde inte skapa spelet: ${err.message}`);
        }
    };

    if (loading) return <Spinner />;
    if (error) return <p className="text-red-500 p-4">{error}</p>;
    if (!team) return <p>Laddar lag...</p>;

    const isLeader = user.uid === team.leaderId;

    if (game && game.status !== 'finished') {
        return (
            <div className="container mx-auto p-4 max-w-2xl text-center">
                 <Header title={`Lobby: ${team.name}`} user={user} userData={userData} />
                 <div className="sc-card mt-8">
                    <h2 className="text-2xl font-bold text-accent-cyan mb-4">Ett spel pågår redan!</h2>
                    <p className="mb-6">Bana: {game.course.name}</p>
                    <button onClick={() => navigate(`/game/${game.id}`)} className="sc-button sc-button-blue w-full">Gå till spelet</button>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 max-w-2xl text-center">
            <Header title={`Lobby: ${team.name}`} user={user} userData={userData} />
            <div className="sc-card mt-8">
                {isLeader ? (
                    <>
                        <h2 className="text-2xl font-bold text-accent-cyan mb-4">Skapa ett nytt spel</h2>
                        <div className="text-left mb-4">
                            <label htmlFor="course-select" className="block text-sm font-medium text-text-secondary mb-2">Välj bana:</label>
                            <select 
                                id="course-select"
                                value={selectedCourse} 
                                onChange={(e) => setSelectedCourse(e.target.value)} 
                                className="sc-input"
                            >
                                {courses.map(course => (
                                    <option key={course.id} value={course.id}>{course.name}</option>
                                ))}
                            </select>
                        </div>
                        <button onClick={handleCreateGame} className="sc-button w-full">Skapa spel</button>
                    </>
                ) : (
                    <>
                        <h2 className="text-2xl font-bold text-accent-yellow mb-4">Väntar...</h2>
                        <p>Lagledaren förbereder spelet.</p>
                        <Spinner />
                    </>
                )}
            </div>
        </div>
    );
};

export default Lobby;

