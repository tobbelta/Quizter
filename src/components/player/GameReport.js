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
    if (!report || !report.game) return <div className="text-center mt-10 p-4 sc-card max-w-md mx-auto">Kunde inte ladda spelrapport.</div>;
    
    // Säker beräkning av total tid
    let totalTime = 0;

    try {
        // Kontrollera olika möjliga fält för finish-tid (prioritera endTime som används i GameScreen)
        const finishTimeValue = report.game.endTime || report.game.finishTime;
        const startTimeValue = report.game.startTime;

        if (finishTimeValue && startTimeValue) {
            let finishSeconds, startSeconds;

            // Hantera Firestore Timestamp för finish
            if (finishTimeValue && finishTimeValue.seconds) {
                finishSeconds = finishTimeValue.seconds;
            } else if (finishTimeValue && finishTimeValue.toDate) {
                finishSeconds = finishTimeValue.toDate().getTime() / 1000;
            } else if (finishTimeValue) {
                finishSeconds = new Date(finishTimeValue).getTime() / 1000;
            } else {
                return;
            }

            // Hantera Firestore Timestamp för start
            if (startTimeValue && startTimeValue.seconds) {
                startSeconds = startTimeValue.seconds;
            } else if (startTimeValue && startTimeValue.toDate) {
                startSeconds = startTimeValue.toDate().getTime() / 1000;
            } else if (startTimeValue) {
                startSeconds = new Date(startTimeValue).getTime() / 1000;
            } else {
                return;
            }

            totalTime = Math.max(0, finishSeconds - startSeconds);
        }
    } catch (error) {
        console.error('Fel vid beräkning av total tid:', error);
        totalTime = 0; // Fallback till 0 om beräkningen misslyckas
    }

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
                        <h2 className="text-2xl font-bold uppercase mb-3 text-accent-cyan">Aktiva Lagmedlemmar vid Målgång</h2>
                        <ul className="list-disc list-inside space-y-1 text-text-primary">
                            {/* Visa endast spelare som var aktiva vid målgång */}
                            {(report.game.activePlayersAtFinish || report.team.memberIds).map(id => (
                                <li key={id}>
                                    {report.users[id]?.displayName || 'Okänd spelare'}
                                    {report.game.activePlayersAtFinish && !report.game.activePlayersAtFinish.includes(id) &&
                                        <span className="text-gray-400 ml-2">(inte aktiv vid målgång)</span>
                                    }
                                </li>
                            ))}
                        </ul>
                        {report.game.activePlayersAtFinish && report.game.activePlayersAtFinish.length < report.team.memberIds.length && (
                            <p className="text-sm text-gray-400 mt-2">
                                {report.team.memberIds.length - report.game.activePlayersAtFinish.length} spelare var inte aktiva vid målgång
                            </p>
                        )}
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold uppercase mb-3 text-accent-cyan">Hinderöversikt</h2>
                        <ul className="space-y-3">
                            {(report.course.obstacles || []).map((obstacle, index) => {
                                const isCompleted = (report.game.completedObstacles || []).includes(obstacle.obstacleId);

                                // Hitta detaljerad information om vem som löste hindret
                                // Om det finns flera lösningar, använd den senaste som RÄKNAS (finns i completedObstacles)
                                const allSolutionsForObstacle = (report.game.completedObstaclesDetailed || [])
                                    .filter(detail => detail.obstacleId === obstacle.obstacleId)
                                    .sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt)); // Senaste först

                                // För hinder som fortfarande räknas som lösta, använd den senaste lösningen
                                // För hinder som inte längre räknas, använd den första (ursprungliga) lösningen för rapportering
                                const completedDetail = isCompleted ?
                                    allSolutionsForObstacle[0] : // Senaste för lösta hinder
                                    allSolutionsForObstacle[allSolutionsForObstacle.length - 1]; // Första för icke-lösta

                                let status;
                                if (isCompleted) {
                                    // Försök hitta vem som löste hindret
                                    const solverName = completedDetail?.solverName ||
                                                     (completedDetail?.solvedBy ? report.users[completedDetail.solvedBy]?.displayName : null);

                                    if (solverName) {
                                        // Kontrollera aktivitetsstatus vid lösningstidpunkt
                                        const solverWasActiveWhenSolved = completedDetail?.solverWasActive !== false; // Default true för äldre data

                                        // Kontrollera om hindret fortfarande räknas som löst (finns i completedObstacles)
                                        const stillCounted = (report.game.completedObstacles || []).includes(obstacle.obstacleId);

                                        // Hitta vilka lagmedlemmar som INTE var aktiva när detta hinder löstes
                                        const inactiveMembers = [];
                                        if (completedDetail?.activePlayersWhenSolved) {
                                            // Ny data: vi har information om vilka som var aktiva
                                            const activeWhenSolved = completedDetail.activePlayersWhenSolved.map(p => p.uid);
                                            report.team.memberIds.forEach(memberId => {
                                                if (!activeWhenSolved.includes(memberId)) {
                                                    const memberName = report.users[memberId]?.displayName || 'Okänd spelare';
                                                    inactiveMembers.push(memberName);
                                                }
                                            });
                                        }

                                        status = (
                                            <div className="text-sm">
                                                <span className={`font-semibold ${stillCounted ? 'text-green-400' : 'text-yellow-400'}`}>
                                                    {stillCounted ? 'Klarad' : 'Löst men ej giltig'}
                                                </span>
                                                <span className="text-text-secondary"> av {solverName}</span>
                                                {!solverWasActiveWhenSolved && (
                                                    <span className="text-gray-400 text-xs block">
                                                        (lösaren var inte aktiv vid lösningstidpunkt)
                                                    </span>
                                                )}
                                                {inactiveMembers.length > 0 && (
                                                    <span className="text-gray-400 text-xs block">
                                                        ({inactiveMembers.join(', ')} var inte aktiv{inactiveMembers.length > 1 ? 'a' : ''} när hindret löstes)
                                                    </span>
                                                )}
                                                {!stillCounted && (
                                                    <span className="text-yellow-400 text-xs block">
                                                        (lösaren är inte aktiv nu - behöver lösas om)
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    } else {
                                        // Fallback för äldre spel som inte har detaljerad information
                                        status = <span className="font-semibold text-green-400">Klarad</span>;
                                    }
                                } else {
                                    status = <span className="font-semibold text-red-500">Ej klarad</span>;
                                }
                                return (
                                    <li key={index} className="p-3 bg-black/20 rounded-md">
                                        <p className="font-bold">Hinder {index + 1}: {obstacle.obstacleId}</p>
                                        {status}
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
