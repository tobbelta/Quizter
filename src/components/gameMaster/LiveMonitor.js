import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, getDoc, doc, updateDoc, query, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import ConfirmModal from '../shared/ConfirmModal';
import Spinner from '../shared/Spinner';

const LiveMonitor = () => {
    const [createdGames, setCreatedGames] = useState([]);
    const [activeGames, setActiveGames] = useState([]);
    const [finishedGames, setFinishedGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, game: null });
    const navigate = useNavigate();

    useEffect(() => {
        const q = collection(db, 'games');
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            try {
                const gamesData = await Promise.all(snapshot.docs.map(async (gameDoc) => {
                    const game = { id: gameDoc.id, ...gameDoc.data() };
                    const teamSnap = await getDoc(doc(db, 'teams', game.teamId));
                    game.teamName = teamSnap.exists() ? teamSnap.data().name : 'Okänt lag';
                    const courseSnap = await getDoc(doc(db, 'courses', game.courseId));
                    game.courseName = courseSnap.exists() ? courseSnap.data().name : 'Okänd bana';
                    return game;
                }));

                setCreatedGames(gamesData.filter(g => g.status === 'created'));
                setActiveGames(gamesData.filter(g => g.status === 'pending' || g.status === 'started'));
                setFinishedGames(gamesData.filter(g => g.status === 'finished'));
            } catch (error) {
                console.error("Error processing game data:", error);
            } finally {
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleStartGame = async (game) => {
        try {
            const gameRef = doc(db, 'games', game.id);
            const teamRef = doc(db, 'teams', game.teamId);
            await updateDoc(gameRef, { status: 'pending' });
            await updateDoc(teamRef, { currentGameId: game.id });
        } catch (error) {
            console.error("Error starting game: ", error);
        }
    };

    const handleConfirmRestart = async () => {
        const game = confirmModal.game;
        if (!game) return;
        try {
            const gameRef = doc(db, 'games', game.id);
            const teamRef = doc(db, 'teams', game.teamId);
            const courseSnap = await getDoc(doc(db, 'courses', game.courseId));
            if (!courseSnap.exists()) {
                alert("Kunde inte hitta den ursprungliga banan för att återställa spelet.");
                setConfirmModal({ isOpen: false, game: null });
                return;
            }
            const courseData = courseSnap.data();
            const obstacleCount = courseData.obstacles ? courseData.obstacles.length : 0;
            const initialSolvedObstacles = Array(obstacleCount).fill(false);

            await updateDoc(gameRef, {
                status: 'created',
                startTime: null,
                finishTime: null,
                solvedObstacles: initialSolvedObstacles,
                solvedBy: [],
                playersAtFinish: [],
                playerPositions: {}
            });
            await updateDoc(teamRef, { currentGameId: null });

            const replayPathRef = collection(db, 'replays', game.id, 'path');
            const pathSnapshot = await getDocs(replayPathRef);
            const deletePromises = pathSnapshot.docs.map(d => deleteDoc(d.ref));
            await Promise.all(deletePromises);

            setConfirmModal({ isOpen: false, game: null });
        } catch (error) {
            console.error("Error restarting game: ", error);
        }
    };

    const promptRestart = (game) => {
        setConfirmModal({ isOpen: true, game: game });
    };

    const GameCard = ({ game, children }) => (
        <div className="sc-card flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div className="flex-grow">
                <h3 className="font-bold text-lg text-white">{game.teamName}</h3>
                <p className="text-sm text-text-secondary">Bana: <span className="text-accent-yellow">{game.courseName}</span></p>
                <p className="text-sm text-text-secondary">Status: <span className="font-semibold capitalize">{game.status}</span></p>
            </div>
            <div className="flex flex-shrink-0 gap-2 w-full sm:w-auto">{children}</div>
        </div>
    );

    if (loading) {
        return <Spinner />;
    }

    return (
        <>
            {confirmModal.isOpen && (
                <ConfirmModal
                    title="Starta om spel?"
                    message={`Är du säker på att du vill starta om spelet för laget "${confirmModal.game?.teamName}"? All data, inklusive repris, kommer att raderas permanent.`}
                    onConfirm={handleConfirmRestart}
                    onCancel={() => setConfirmModal({ isOpen: false, game: null })}
                />
            )}
            <div className="space-y-8">
                <div>
                    <h3 className="text-xl font-bold mb-3 text-accent-cyan">Skapade Spel</h3>
                    {createdGames.length > 0 ? (
                        <div className="space-y-4">
                            {createdGames.map(game => <GameCard key={game.id} game={game}>
                                <button onClick={() => handleStartGame(game)} className="sc-button sc-button-green w-full">Starta Spel</button>
                            </GameCard>)}
                        </div>
                    ) : <p className="text-text-secondary">Inga nya spel har skapats.</p>}
                </div>
                <div>
                    <h3 className="text-xl font-bold mb-3 text-accent-cyan">Pågående Spel</h3>
                    {activeGames.length > 0 ? (
                        <div className="space-y-4">
                            {activeGames.map(game => <GameCard key={game.id} game={game}>
                                <button onClick={() => navigate(`/spectate/${game.id}`)} className="sc-button sc-button-blue w-full">Åskåda</button>
                                <button onClick={() => promptRestart(game)} className="sc-button w-full">Starta om</button>
                            </GameCard>)}
                        </div>
                    ) : <p className="text-text-secondary">Inga spel pågår just nu.</p>}
                </div>
                <div>
                    <h3 className="text-xl font-bold mb-3 text-accent-cyan">Avslutade Spel</h3>
                    {finishedGames.length > 0 ? (
                        <div className="space-y-4">
                            {finishedGames.map(game => <GameCard key={game.id} game={game}>
                                <button onClick={() => navigate(`/report/${game.id}`)} className="sc-button w-full">Visa Rapport</button>
                                <button onClick={() => promptRestart(game)} className="sc-button w-full">Starta om</button>
                            </GameCard>)}
                        </div>
                    ) : <p className="text-text-secondary">Inga avslutade spel att visa.</p>}
                </div>
            </div>
        </>
    );
};

export default LiveMonitor;
