// src/components/gameMaster/LiveMonitor.js
import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import SkeletonLoader from '../shared/SkeletonLoader';
import JsonDisplayModal from './JsonDisplayModal';
import ConfirmModal from '../shared/ConfirmModal';

const LiveMonitor = () => {
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedGameData, setSelectedGameData] = useState(null);
    const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, message: '' });
    const [selectedGames, setSelectedGames] = useState(new Set());
    const [coursesMap, setCoursesMap] = useState({});
    const [teamsMap, setTeamsMap] = useState({});
    const navigate = useNavigate();

    useEffect(() => {
        const unsubGames = onSnapshot(collection(db, 'games'), (querySnapshot) => {
            const gamesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setGames(gamesData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching games:", error);
            setLoading(false);
        });

        const unsubCourses = onSnapshot(collection(db, 'courses'), (snapshot) => {
            const coursesData = {};
            snapshot.forEach(doc => {
                coursesData[doc.id] = doc.data();
            });
            setCoursesMap(coursesData);
        });

        const unsubTeams = onSnapshot(collection(db, 'teams'), (snapshot) => {
            const teamsData = {};
            snapshot.forEach(doc => {
                teamsData[doc.id] = doc.data();
            });
            setTeamsMap(teamsData);
        });

        return () => {
            unsubGames();
            unsubCourses();
            unsubTeams();
        };
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

    const handleDeleteGame = (gameId) => {
        setConfirmModal({
            isOpen: true,
            message: 'Är du säker på att du vill radera detta spel permanent? Denna åtgärd kan inte ångras.',
            onConfirm: () => confirmDelete(gameId),
        });
    };

    const confirmDelete = async (gameId) => {
        try {
            await deleteDoc(doc(db, 'games', gameId));
            // Optionally also clean up related data like player positions
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        } catch (error) {
            console.error("Error deleting game:", error);
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        }
    };

    const handleToggleGame = (gameId) => {
        const newSelected = new Set(selectedGames);
        if (newSelected.has(gameId)) {
            newSelected.delete(gameId);
        } else {
            newSelected.add(gameId);
        }
        setSelectedGames(newSelected);
    };

    const handleSelectAll = (gameList) => {
        const gameIds = gameList.map(game => game.id);
        const allSelected = gameIds.every(id => selectedGames.has(id));

        const newSelected = new Set(selectedGames);
        if (allSelected) {
            gameIds.forEach(id => newSelected.delete(id));
        } else {
            gameIds.forEach(id => newSelected.add(id));
        }
        setSelectedGames(newSelected);
    };

    const handleBulkDelete = () => {
        if (selectedGames.size === 0) return;

        setConfirmModal({
            isOpen: true,
            message: `Är du säker på att du vill radera ${selectedGames.size} spel permanent? Denna åtgärd kan inte ångras.`,
            onConfirm: confirmBulkDelete,
        });
    };

    const confirmBulkDelete = async () => {
        try {
            const deletePromises = Array.from(selectedGames).map(gameId =>
                deleteDoc(doc(db, 'games', gameId))
            );
            await Promise.all(deletePromises);
            setSelectedGames(new Set());
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        } catch (error) {
            console.error("Error bulk deleting games:", error);
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        }
    };

    const confirmRestart = async (gameId) => {
        try {
            const gameRef = doc(db, 'games', gameId);
            const gameSnap = await getDoc(gameRef);
            if (!gameSnap.exists()) return;

            const courseRef = doc(db, 'courses', gameSnap.data().courseId);
            const courseSnap = await getDoc(courseRef);
            if (!courseSnap.exists()) return;

            await updateDoc(gameRef, {
                status: 'created',
                startTime: null,
                finishTime: null,
                completedObstacles: [],
                activeObstacleId: null,
                playersAtFinish: [],
                playerPositions: {}
            });
            
            // Töm repris-data (antaget att den finns i en subcollection)
            // Denna del kan behöva anpassas beroende på exakt databasstruktur
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        } catch (error) {
            console.error("Error restarting game:", error);
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        }
    };
    
    const renderGameList = (gameList, title) => {
        const hasGames = gameList.length > 0;
        const selectedInCategory = gameList.filter(game => selectedGames.has(game.id)).length;
        const allSelected = hasGames && selectedInCategory === gameList.length;

        return (
            <div className="mb-8">
                <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-gray-400">{title}</h3>
                        {hasGames && (
                            <label className="flex items-center gap-2 text-sm text-gray-400">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={() => handleSelectAll(gameList)}
                                    className="rounded border-gray-600 bg-gray-800 text-accent-cyan focus:ring-accent-cyan"
                                />
                                Välj alla ({gameList.length})
                            </label>
                        )}
                    </div>
                    {selectedInCategory > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            className="sc-button sc-button-red"
                        >
                            Radera valda ({selectedInCategory})
                        </button>
                    )}
                </div>
                {hasGames ? (
                    <ul className="space-y-3">
                        {gameList.map(game => (
                            <li key={game.id} className="sc-card flex items-center p-3 gap-3">
                                <input
                                    type="checkbox"
                                    checked={selectedGames.has(game.id)}
                                    onChange={() => handleToggleGame(game.id)}
                                    className="rounded border-gray-600 bg-gray-800 text-accent-cyan focus:ring-accent-cyan flex-shrink-0"
                                />
                                <div className="flex-grow">
                                    <p className="font-bold text-lg text-white">{coursesMap[game.courseId]?.name || 'Okänd Bana'}</p>
                                    <p className="text-sm text-gray-400">Lag: {teamsMap[game.teamId]?.name || 'Okänt Lag'}</p>
                                    <p className="text-sm text-text-secondary">Skapat: {game.createdAt ? new Date(game.createdAt.seconds * 1000).toLocaleString('sv-SE') : 'Okänt datum'}</p>
                                    <p className="text-xs text-gray-500">Game ID: {game.id}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {game.status === 'created' && <button onClick={() => handleStartGame(game.id, game.teamId)} className="sc-button sc-button-green">Starta Spel</button>}
                                    {game.status === 'started' && <button onClick={() => navigate(`/gm/spectate/${game.id}`)} className="sc-button">Åskåda</button>}
                                    {game.status === 'finished' && <button onClick={() => navigate(`/report/${game.id}`)} className="sc-button">Visa Rapport</button>}
                                    <button onClick={() => handleShowJson(game)} className="sc-button">Visa JSON</button>
                                    {(game.status === 'started' || game.status === 'finished') && <button onClick={() => handleRestartGame(game.id)} className="sc-button sc-button-red">Starta om</button>}
                                    <button onClick={() => handleDeleteGame(game.id)} className="sc-button sc-button-red">Radera</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : <p className="text-gray-500">Inga spel i denna kategori.</p>}
            </div>
        );
    };
    
    if (loading) return <SkeletonLoader type="gameList" count={6} />;

    const createdGames = games.filter(g => g.status === 'created');
    const ongoingGames = games.filter(g => g.status === 'pending' || g.status === 'started');
    const finishedGames = games.filter(g => g.status === 'finished');

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-accent-cyan">Spel</h2>
                {selectedGames.size > 0 && (
                    <div className="flex items-center gap-4">
                        <span className="text-gray-400">{selectedGames.size} spel valda</span>
                        <button
                            onClick={handleBulkDelete}
                            className="sc-button sc-button-red"
                        >
                            Radera alla valda
                        </button>
                        <button
                            onClick={() => setSelectedGames(new Set())}
                            className="sc-button"
                        >
                            Avmarkera alla
                        </button>
                    </div>
                )}
            </div>

            {renderGameList(createdGames, "Skapade Spel")}
            {renderGameList(ongoingGames, "Pågående Spel")}
            {renderGameList(finishedGames, "Avslutade Spel")}
            {isJsonModalOpen && <JsonDisplayModal open={isJsonModalOpen} data={selectedGameData} onClose={() => setIsJsonModalOpen(false)} />}
            {confirmModal.isOpen && <ConfirmModal message={confirmModal.message} onConfirm={confirmModal.onConfirm} onClose={() => setConfirmModal({isOpen: false, onConfirm: null, message: ''})} />}
        </div>
    );
};

export default LiveMonitor;
