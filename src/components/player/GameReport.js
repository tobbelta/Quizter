import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, documentId, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import Spinner from '../shared/Spinner';
import Header from '../shared/Header';

const GameReport = ({ user, userData }) => {
    const { gameId } = useParams();
    const navigate = useNavigate();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const fetchReportData = async () => {
            try {
                const gameSnap = await getDoc(doc(db, 'games', gameId));
                if (!gameSnap.exists() || gameSnap.data().status !== 'finished') {
                    setLoading(false);
                    return;
                }
                const gameData = gameSnap.data();
                const courseSnap = await getDoc(doc(db, 'courses', gameData.courseId));
                const teamSnap = await getDoc(doc(db, 'teams', gameData.teamId));
                if (!courseSnap.exists() || !teamSnap.exists()) {
                    setLoading(false);
                    return;
                }
                const courseData = courseSnap.data();
                const teamData = teamSnap.data();
                const usersQuery = query(collection(db, 'users'), where(documentId(), 'in', teamData.memberIds));
                const usersSnapshot = await getDocs(usersQuery);
                const usersMap = {};
                usersSnapshot.forEach(doc => {
                    usersMap[doc.id] = doc.data();
                });
                setReport({ game: gameData, course: courseData, team: teamData, users: usersMap });
            } catch (err) {
                console.error("Error fetching report data:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchReportData();
    }, [gameId]);
    
    const formatTime = (seconds) => {
        if (isNaN(seconds) || seconds < 0) return "00:00:00";
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };
    
    if (loading) return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;
    if (!report) return <div className="text-center mt-10 p-4 sc-card max-w-md mx-auto">Kunde inte ladda spelrapport.</div>;
    
    const totalTime = (report.game.finishTime.seconds - report.game.startTime.seconds);

    return (
        <>
            <Header title="Spelrapport" user={user} userData={userData}>
                <button onClick={() => navigate(userData.role === 'gameMaster' ? '/gamemaster' : '/teams')} className="sc-button">Tillbaka</button>
            </Header>
            {/* FIX: Använder nu samma layout som övriga sidor */}
            <main className="container mx-auto p-4 max-w-3xl">
                <div className="sc-card">
                    <p className="text-center text-text-secondary mb-6">Bra jobbat, <span className="font-bold text-text-primary">{report.team.name}</span>!</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-center mb-8 p-4 bg-black/20 rounded-lg">
                        <div>
                            <p className="text-sm text-text-secondary uppercase">Bana</p>
                            <p className="text-2xl font-bold text-accent-yellow">{report.course.name}</p>
                        </div>
                        <div>
                            <p className="text-sm text-text-secondary uppercase">Sluttid</p>
                            <p className="text-2xl font-bold text-accent-yellow">{formatTime(totalTime)}</p>
                        </div>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-2xl font-bold uppercase mb-3 text-accent-cyan">Lagmedlemmar</h2>
                        <ul className="list-disc list-inside space-y-1 text-text-primary">
                            {report.team.memberIds.map(id => (
                                <li key={id}>{report.users[id]?.displayName || 'Okänd spelare'}</li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold uppercase mb-3 text-accent-cyan">Hinderöversikt</h2>
                        <ul className="space-y-3">
                            {(report.course.obstacles || []).map((obstacle, index) => {
                                const solvedByEntry = (report.game.solvedBy || []).find(entry => entry.obstacleIndex === index);
                                const wasFaulty = (report.game.faultyObstacles || []).includes(index);
                                let status;
                                if (wasFaulty) {
                                    status = <span className="font-semibold text-yellow-400">Felaktigt (hoppades över)</span>;
                                } else if (solvedByEntry) {
                                    const solverName = report.users[solvedByEntry.userId]?.displayName || 'Okänd';
                                    status = <>Klarades av <span className="font-semibold text-green-400">{solverName}</span></>;
                                } else {
                                    status = <span className="font-semibold text-red-500">Ej klarad</span>;
                                }
                                return (
                                    <li key={index} className="p-3 bg-black/20 rounded-md">
                                        <p className="font-bold">{obstacle.question}</p>
                                        <p className="text-sm text-text-secondary">{status}</p>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                    
                    <div className="text-center mt-8 space-x-4">
                        <button onClick={() => navigate(`/replay-v2/${gameId}`)} className="sc-button sc-button-blue">
                            Visa Repris
                        </button>
                    </div>
                </div>
            </main>
        </>
    );
};

export default GameReport;
