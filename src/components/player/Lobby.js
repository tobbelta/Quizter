import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, getDocs, addDoc, query, where } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import Spinner from '../shared/Spinner';
import Header from '../shared/Header';

const Lobby = ({ user, userData }) => {
    const { teamId } = useParams();
    const navigate = useNavigate();
    const [team, setTeam] = useState(null);
    const [courses, setCourses] = useState([]);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState('');
    const [isTestMode, setIsTestMode] = useState(false);
    
    const isLeader = team && user && team.leaderId === user.uid;

    useEffect(() => {
        const teamDocRef = doc(db, 'teams', teamId);
        const unsubscribeTeam = onSnapshot(teamDocRef, (doc) => {
            if (doc.exists()) {
                setTeam({ id: doc.id, ...doc.data() });
            } else {
                setError("Laget hittades inte.");
            }
        });

        const fetchCourses = async () => {
            try {
                const coursesSnapshot = await getDocs(collection(db, 'courses'));
                const coursesList = coursesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setCourses(coursesList);
                if (coursesList.length > 0) {
                    setSelectedCourseId(coursesList[0].id);
                }
            } catch (err) {
                console.error("Error fetching courses:", err);
                setError("Kunde inte ladda banor.");
            } finally {
                setLoading(false);
            }
        };

        fetchCourses();

        return () => unsubscribeTeam();
    }, [teamId]);

    const handleCreateGame = async () => {
        if (!selectedCourseId || !isLeader) return;
        setIsCreating(true);
        setError('');
        try {
            const q = query(collection(db, 'games'), where('teamId', '==', teamId));
            const existingGames = await getDocs(q);
            if (!existingGames.empty) {
                setError("Det finns redan ett spel för detta lag. Starta om det från Game Master-panelen.");
                setIsCreating(false);
                return;
            }
            await addDoc(collection(db, 'games'), {
                courseId: selectedCourseId,
                teamId: teamId,
                status: 'created',
                startTime: null,
                finishTime: null,
                solvedObstacles: [],
                playerPositions: {},
                playersAtFinish: [],
                isTestMode: isTestMode,
            });
            navigate('/teams');
        } catch (err) {
            console.error("Error creating game:", err);
            setError("Ett fel uppstod när spelet skulle skapas.");
        } finally {
            setIsCreating(false);
        }
    };

    if (loading || !team) {
        return <div className="flex items-center justify-center h-screen"><Spinner /></div>;
    }

    return (
        <>
            <Header title={`Skapa Spel: ${team?.name}`} user={user} userData={userData}>
                <button onClick={() => navigate('/teams')} className="sc-button">Tillbaka till lag</button>
            </Header>
            {/* FIX: Använder nu samma layout som övriga sidor */}
            <main className="container mx-auto p-4 max-w-2xl">
                <div className="sc-card">
                    {isLeader ? (
                        <div className="space-y-6">
                            <div>
                                <label htmlFor="course-select" className="block text-lg font-semibold text-text-primary mb-2">Välj en bana</label>
                                <select
                                    id="course-select"
                                    value={selectedCourseId}
                                    onChange={(e) => setSelectedCourseId(e.target.value)}
                                    className="sc-input"
                                >
                                    {courses.map(course => (
                                        <option key={course.id} value={course.id}>{course.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center">
                                <input
                                    id="test-mode"
                                    type="checkbox"
                                    checked={isTestMode}
                                    onChange={(e) => setIsTestMode(e.target.checked)}
                                    className="h-5 w-5 rounded"
                                />
                                <label htmlFor="test-mode" className="ml-3 block text-text-primary">
                                    Testläge (1 spelare krävs för vinst)
                                </label>
                            </div>
                            <button
                                onClick={handleCreateGame}
                                disabled={!selectedCourseId || isCreating}
                                className="sc-button sc-button-blue w-full"
                            >
                                {isCreating ? 'Skapar...' : 'Skapa Spel'}
                            </button>
                            {error && <p className="text-red-500 text-center mt-2">{error}</p>}
                        </div>
                    ) : (
                        <p className="text-center text-text-secondary">Endast lagledaren kan skapa ett spel.</p>
                    )}
                </div>
            </main>
        </>
    );
};

export default Lobby;
