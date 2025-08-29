// src/components/player/Lobby.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, addDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase'; // Tog bort oanvänd 'auth'
import Spinner from '../shared/Spinner';
import Header from '../shared/Header';

const Lobby = ({ user, userData }) => {
    const { teamId } = useParams();
    const [team, setTeam] = useState(null);
    const [courses, setCourses] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState('');
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const teamRef = doc(db, 'teams', teamId);
        const unsubscribeTeam = onSnapshot(teamRef, (doc) => {
            if (doc.exists()) {
                const teamData = { id: doc.id, ...doc.data() };
                setTeam(teamData);
                // Om ett spel startas (status: pending), navigera till spelet
                if (teamData.currentGameId && teamData.gameStatus === 'pending') {
                    navigate(`/game/${teamData.currentGameId}`);
                }
            } else {
                navigate('/teams'); // Teamet finns inte, skicka tillbaka
            }
        }, (error) => {
            console.error("Error fetching team:", error);
            navigate('/teams');
        });

        const fetchCourses = async () => {
            const coursesCollection = collection(db, 'courses');
            const q = query(coursesCollection, orderBy('createdAt', 'desc'));
            const courseSnapshot = await getDocs(q);
            const courseList = courseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCourses(courseList);
            if (courseList.length > 0) {
                setSelectedCourse(courseList[0].id);
            }
            setLoading(false);
        };

        fetchCourses();

        return () => unsubscribeTeam();
    }, [teamId, navigate]);

    const handleCreateGame = async () => {
        if (!selectedCourse || !team) return;
        setIsCreating(true);

        try {
            const selectedCourseData = courses.find(c => c.id === selectedCourse);
            const obstacleCount = selectedCourseData.obstacles.length;

            const newGame = {
                courseId: selectedCourse,
                courseName: selectedCourseData.name,
                teamId: team.id,
                teamName: team.name,
                status: 'created',
                createdAt: new Date(),
                playerPositions: {},
                solvedObstacles: Array(obstacleCount).fill(false),
                solvedBy: [],
                faultyObstacles: [],
                playersAtFinish: [],
                startTime: null,
                finishTime: null,
                isTestMode: false // Standard
            };
            const gameRef = await addDoc(collection(db, 'games'), newGame);
            
            // Uppdatera teamet med spelets status
            await updateDoc(doc(db, 'teams', team.id), {
                gameStatus: 'created',
                currentGameId: gameRef.id
            });
            
            navigate('/teams');

        } catch (error) {
            console.error("Error creating game: ", error);
            alert("Kunde inte skapa spelet.");
        } finally {
            setIsCreating(false);
        }
    };

    if (loading || !team) return <div className="flex items-center justify-center h-screen"><Spinner /></div>;

    const isLeader = user.uid === team.leaderId;

    return (
        <div className="min-h-screen">
            <Header title={`Lobby för ${team.name}`} user={user} userData={userData} />
            <main className="container mx-auto p-4">
                <div className="sc-card max-w-2xl mx-auto">
                    {team.gameStatus === 'created' ? (
                        <div className="text-center">
                            <h2 className="text-2xl font-bold mb-4">Spel Skapat!</h2>
                            <p className="text-gray-400">Väntar på att Game Master ska starta spelet från sin panel.</p>
                            <div className="mt-6">
                                <Spinner />
                            </div>
                        </div>
                    ) : (
                        isLeader ? (
                            <div>
                                <h2 className="text-2xl font-bold mb-4">Välj en bana för att skapa ett spel</h2>
                                {courses.length > 0 ? (
                                    <div className="space-y-4">
                                        <select
                                            value={selectedCourse}
                                            onChange={(e) => setSelectedCourse(e.target.value)}
                                            className="sc-input"
                                        >
                                            {courses.map(course => (
                                                <option key={course.id} value={course.id}>{course.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={handleCreateGame}
                                            disabled={isCreating}
                                            className="sc-button sc-button-blue w-full"
                                        >
                                            {isCreating ? 'Skapar...' : 'Skapa Spel'}
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-gray-400">Inga banor har skapats än.</p>
                                )}
                            </div>
                        ) : (
                            <div className="text-center">
                                <h2 className="text-2xl font-bold mb-4">Välkommen till lobbyn!</h2>
                                <p className="text-gray-400">Lagledaren väljer en bana. Spelet startar snart.</p>
                                <div className="mt-6">
                                    <Spinner />
                                </div>
                            </div>
                        )
                    )}
                </div>
            </main>
        </div>
    );
};

export default Lobby;
