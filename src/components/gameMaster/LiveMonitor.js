// src/components/gameMaster/LiveMonitor.js
import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore'; // Tog bort oanvänd 'query'
import { db } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import Spinner from '../shared/Spinner';
import JsonDisplayModal from './JsonDisplayModal';
import ConfirmModal from '../shared/ConfirmModal';

const LiveMonitor = () => {
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedGameData, setSelectedGameData] = useState(null);
    const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, message: '' });
    const navigate = useNavigate();

    useEffect(() => {
        const q = collection(db, 'games');
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const gamesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setGames(gamesData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching games:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);
    
    const handleShowJson = async (game) => {
        try {
            const courseSnap = await getDoc(doc(db, 'courses', game.courseId));
            const teamSnap = await getDoc(doc(db, 'teams', game.teamId));
            const obstaclesDetails = [];
            if (courseSnap.exists() && courseSnap.data().obstacles) {
                for (const obs of courseSnap.data().obstacles) {
                    if (obs.obstacleId) {
                        const obstacleDoc = await getDoc(doc(db, 'obstacles', obs.obstacleId));
                        if (obstacleDoc.exists()) {
                            obstaclesDetails.push({ position: obs.position, details: obstacleDoc.data() });
                        }
                    }
                }
            }

            const fullGameData = {
                gameDetails: game,
                teamDetails: teamSnap.exists() ? teamSnap.data() : null,
                courseDetails: courseSnap.exists() ? { ...courseSnap.data(), obstacles: obstaclesDetails } : null
            };
            setSelectedGameData(fullGameData);
            setIsJsonModalOpen(true);
        } catch (error) {
            console.error("Error fetching full game data:", error);
        }
    };
    
    const handleStartGame = async (gameId, teamId) => {
        const gameRef = doc(db, 'games', gameId);
        const teamRef = doc(db, 'teams', teamId);
        await updateDoc(gameRef, { status: 'pending' });
        await updateDoc(teamRef, { currentGameId: gameId });
    };

    const handleRestartGame = (gameId) => {
        setConfirmModal({
            isOpen: true,
            message: 'Är du säker på att du vill starta om detta spel? All data kommer att nollställas.',
            onConfirm: () => confirmRestart(gameId),
        });
    };

    const confirmRestart = async (gameId) => {
        try {
            const gameRef = doc(db, 'games', gameId);
            const gameSnap = await getDoc(gameRef);
            if (!gameSnap.exists()) return;

            const courseRef = doc(db, 'courses', gameSnap.data().courseId);
            const courseSnap = await getDoc(courseRef);
            if (!courseSnap.exists()) return;

            const obstacleCount = courseSnap.data().obstacles?.length || 0;
            const initialSolved = Array(obstacleCount).fill(false);

            await updateDoc(gameRef, {
                status: 'created',
                startTime: null,
                finishTime: null,
                solvedObstacles: initialSolved,
                solvedBy: [],
                faultyObstacles: [],
                playersAtFinish: [],
                playerPositions: {}
            });
            
            // Töm repris-data (antaget att den finns i en subcollection)
            // Denna del kan behöva anpassas beroende på exakt databasstruktur
        } catch (error) {
            console.error("Error restarting game:", error);
        }
    };
    
    const renderGameList = (gameList, title) => (
        <div className="mb-8">
            <h3 className="text-xl font-bold mb-3 text-gray-400">{title}</h3>
            {gameList.length > 0 ? (
                <ul className="space-y-3">
                    {gameList.map(game => (
                        <li key={game.id} className="sc-card flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 gap-3">
                            <div>
                                <p className="font-bold text-lg text-white">{game.courseName || 'Okänd Bana'}</p>
                                <p className="text-sm text-gray-400">Lag: {game.teamName || 'Okänt Lag'}</p>
                                <p className="text-xs text-gray-500">Game ID: {game.id}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {game.status === 'created' && <button onClick={() => handleStartGame(game.id, game.teamId)} className="sc-button sc-button-green">Starta Spel</button>}
                                {game.status === 'started' && <button onClick={() => navigate(`/spectate/${game.id}`)} className="sc-button">Åskåda</button>}
                                {game.status === 'finished' && <button onClick={() => navigate(`/report/${game.id}`)} className="sc-button">Visa Rapport</button>}
                                <button onClick={() => handleShowJson(game)} className="sc-button">Visa JSON</button>
                                {(game.status === 'started' || game.status === 'finished') && <button onClick={() => handleRestartGame(game.id)} className="sc-button sc-button-red">Starta om</button>}
                            </div>
                        </li>
                    ))}
                </ul>
            ) : <p className="text-gray-500">Inga spel i denna kategori.</p>}
        </div>
    );
    
    if (loading) return <Spinner />;

    const createdGames = games.filter(g => g.status === 'created');
    const ongoingGames = games.filter(g => g.status === 'pending' || g.status === 'started');
    const finishedGames = games.filter(g => g.status === 'finished');

    return (
        <div>
            {renderGameList(createdGames, "Skapade Spel")}
            {renderGameList(ongoingGames, "Pågående Spel")}
            {renderGameList(finishedGames, "Avslutade Spel")}
            {isJsonModalOpen && <JsonDisplayModal data={selectedGameData} onClose={() => setIsJsonModalOpen(false)} />}
            {confirmModal.isOpen && <ConfirmModal message={confirmModal.message} onConfirm={confirmModal.onConfirm} onClose={() => setConfirmModal({isOpen: false, onConfirm: null, message: ''})} />}
        </div>
    );
};

export default LiveMonitor;
