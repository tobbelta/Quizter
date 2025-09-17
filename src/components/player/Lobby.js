import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useNavigate, useLocation } from 'react-router-dom';
import Spinner from '../shared/Spinner';
import { useDebug } from '../../context/DebugContext';

const Lobby = ({ user, userData }) => {
    const [courses, setCourses] = useState([]);
    const [teams, setTeams] = useState([]);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [isTestMode, setIsTestMode] = useState(false);

    const navigate = useNavigate();
    const location = useLocation();
    const { addLog } = useDebug();

    // Fetch courses
    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'courses'), (snapshot) => {
            const coursesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCourses(coursesData);
        });
        return unsubscribe;
    }, []);

    // Fetch teams and handle pre-selection
    useEffect(() => {
        if (!user) return;

        const preselectedTeamId = location.state?.teamId;
        if (preselectedTeamId) {
            addLog(`Mottog förvalt lag-ID: ${preselectedTeamId}`);
            setSelectedTeamId(preselectedTeamId);
        }

        const unsubscribe = onSnapshot(collection(db, 'teams'), (snapshot) => {
            const userTeams = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(team => team.memberIds && team.memberIds.includes(user.uid));
            setTeams(userTeams);

            if (!preselectedTeamId && userTeams.length === 1) {
                addLog(`Endast ett lag hittades, väljer automatiskt: ${userTeams[0].id}`);
                setSelectedTeamId(userTeams[0].id);
            }
            
            setLoading(false);
        }, (err) => {
            console.error("Error fetching teams:", err);
            setError("Kunde inte ladda dina lag.");
            setLoading(false);
        });
        return unsubscribe;
    }, [user, location.state, addLog]);

    const handleCreateGame = async () => {
        addLog("1. 'Skapa Spel' klickad. Startar processen.");
        if (!selectedCourseId || !selectedTeamId) {
            const errorMsg = 'Du måste välja både en bana och ett lag.';
            addLog(`2. Validering misslyckades: ${errorMsg}`);
            setError(errorMsg);
            return;
        }
        addLog(`2. Validering OK. Bana: ${selectedCourseId}, Lag: ${selectedTeamId}`);
        setIsCreating(true);
        setError('');
        if (!user) {
            const errorMsg = "Användardata saknas. Kan inte skapa spel.";
            addLog(`3. Fel: ${errorMsg}`);
            setError(errorMsg);
            setIsCreating(false);
            return;
        }
        addLog("3. Användardata finns.");
        try {
            addLog("4. Försöker hämta bandata från databasen...");
            const courseRef = doc(db, 'courses', selectedCourseId);
            const courseSnap = await getDoc(courseRef);
            if (!courseSnap.exists()) throw new Error("Vald bana existerar inte längre.");
            const courseData = courseSnap.data();
            addLog("5. Bandata hämtad. Förbereder spelobjekt.");
            const gameData = {
                courseId: selectedCourseId, course: courseData, teamId: selectedTeamId,
                status: 'pending', hostId: user.uid, createdAt: serverTimestamp(),
                playerPositions: {}, completedObstacles: [],
                activeObstacleId: courseData.obstacles?.[0]?.obstacleId || null,
                isTestMode: isTestMode,
            };
            addLog("6. Spelobjekt skapat. Försöker spara till databasen...");
            const gameDoc = await addDoc(collection(db, 'games'), gameData);
            addLog(`7. Spel skapat med ID: ${gameDoc.id}.`);
            addLog("8. Försöker uppdatera laget med spel-ID...");
            const teamRef = doc(db, 'teams', selectedTeamId);
            await updateDoc(teamRef, { currentGameId: gameDoc.id });
            addLog("9. Laget uppdaterat. Navigerar till spelet...");
            navigate(`/game/${gameDoc.id}`);
        } catch (err) {
            addLog(`FEL: Ett fel uppstod i 'try'-blocket: ${err.message}`);
            console.error('Error creating game:', err);
            setError(`Kunde inte skapa spelet: ${err.message}`);
            setIsCreating(false);
        }
    };
    
    if (loading) return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;

    return (
        <div className="container mx-auto p-8">
            <h1 className="text-3xl font-bold mb-6">Lobby</h1>
            {error && <p className="mb-4 text-red-500">{error}</p>}
            <div className="space-y-4">
                <div>
                    <label htmlFor="course" className="block text-sm font-medium text-gray-700">Välj bana</label>
                    <select
                        id="course" value={selectedCourseId}
                        onChange={(e) => setSelectedCourseId(e.target.value)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    >
                        <option value="" disabled>Välj en bana...</option>
                        {courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="team" className="block text-sm font-medium text-gray-700">Välj lag</label>
                    <select
                        id="team" value={selectedTeamId}
                        onChange={(e) => setSelectedTeamId(e.target.value)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    >
                        <option value="" disabled>Välj ett lag...</option>
                        {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                    </select>
                </div>
                <div className="flex items-center">
                    <input id="test-mode" name="test-mode" type="checkbox" checked={isTestMode}
                        onChange={(e) => setIsTestMode(e.target.checked)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="test-mode" className="ml-2 block text-sm text-gray-900">Testläge</label>
                </div>
            </div>
            <div className="mt-6">
                <button
                    onClick={handleCreateGame}
                    disabled={!selectedCourseId || !selectedTeamId || isCreating}
                    className="w-full sc-button sc-button-blue disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isCreating ? 'Skapar spel...' : 'Skapa Spel'}
                </button>
            </div>
        </div>
    );
};

export default Lobby;