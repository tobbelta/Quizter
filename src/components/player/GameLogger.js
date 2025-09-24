import { useCallback } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const GameLogger = ({ gameId, game, team, teamMembers, user }) => {

    const formatTimestamp = useCallback((timestamp) => {
        if (!timestamp) return 'N/A';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleString('sv-SE', {
                timeZone: 'Europe/Stockholm',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (error) {
            return timestamp.toString();
        }
    }, []);

    const formatDuration = useCallback((startTime, endTime) => {
        if (!startTime || !endTime) return 'N/A';
        try {
            const start = startTime.toDate ? startTime.toDate() : new Date(startTime);
            const end = endTime.toDate ? endTime.toDate() : new Date(endTime);
            const diffMs = end - start;
            const diffMinutes = Math.floor(diffMs / 60000);
            const diffSeconds = Math.floor((diffMs % 60000) / 1000);
            return `${diffMinutes}m ${diffSeconds}s`;
        } catch (error) {
            return 'N/A';
        }
    }, []);

    const generateDetailedLog = useCallback((data) => {
        const { game, team, teamMembers, playerPositions, obstacleDetails, currentUser } = data;

        let log = '';
        log += '='.repeat(80) + '\n';
        log += '                         GEOQUEST SPELRAPPORT\n';
        log += '='.repeat(80) + '\n\n';

        // Grundläggande spelinformation
        log += '📋 SPELINFORMATION\n';
        log += '-'.repeat(40) + '\n';
        log += `🎮 Spel-ID: ${game.id || gameId}\n`;
        log += `🏆 Spelnamn: ${game.course?.name || 'N/A'}\n`;
        log += `👥 Lag: ${team.name} (${team.memberIds?.length || 0} medlemmar)\n`;
        log += `📊 Status: ${game.status?.toUpperCase() || 'OKÄND'}\n`;
        log += `⏰ Skapad: ${formatTimestamp(game.createdAt)}\n`;
        log += `🚀 Startad: ${formatTimestamp(game.startTime)}\n`;
        log += `🏁 Avslutad: ${formatTimestamp(game.endTime)}\n`;
        if (game.startTime && game.endTime) {
            log += `⏱️  Total tid: ${formatDuration(game.startTime, game.endTime)}\n`;
        }
        log += `📈 Exporterad av: ${currentUser?.displayName || currentUser?.email || 'Okänd användare'}\n`;
        log += `📅 Export-tid: ${formatTimestamp(new Date())}\n\n`;

        // Lagmedlemmar
        log += '👥 LAGMEDLEMMAR\n';
        log += '-'.repeat(40) + '\n';
        if (teamMembers && teamMembers.length > 0) {
            teamMembers.forEach((member, index) => {
                const playerData = playerPositions[member.uid];
                const isLeader = member.uid === team.leaderId;
                const wasAtFinish = game.playersAtFinish?.includes(member.uid);

                log += `${index + 1}. ${member.displayName || member.name || member.email || 'Namnlös spelare'}${isLeader ? ' 👑 (LAGLEDARE)' : ''}\n`;
                log += `   📧 Email: ${member.email || 'N/A'}\n`;
                log += `   🆔 UID: ${member.uid}\n`;
                log += `   📍 Senaste position: ${playerData?.position ?
                    `${playerData.position.latitude.toFixed(6)}, ${playerData.position.longitude.toFixed(6)}` : 'N/A'}\n`;
                log += `   🕐 Senaste uppdatering: ${playerData?.lastUpdateFormatted || 'N/A'}\n`;
                log += `   ✅ Aktiv vid senaste kända tidpunkt: ${playerData?.isActive ? 'JA' : 'NEJ'}\n`;
                log += `   🏁 Nådde mål: ${wasAtFinish ? 'JA' : 'NEJ'}\n\n`;
            });
        } else {
            log += '   Inga lagmedlemmar hittades\n\n';
        }

        // Bana information
        log += '🗺️  BANAINFORMATION\n';
        log += '-'.repeat(40) + '\n';
        if (game.course) {
            log += `📍 Startpunkt: ${game.course.startPoint?.latitude || game.course.start?.lat || 'N/A'}, ${game.course.startPoint?.longitude || game.course.start?.lng || 'N/A'}\n`;
            log += `🎯 Målpunkt: ${game.course.finishPoint?.latitude || game.course.finish?.lat || 'N/A'}, ${game.course.finishPoint?.longitude || game.course.finish?.lng || 'N/A'}\n`;
            log += `🚧 Antal hinder: ${game.course.obstacles?.length || 0}\n\n`;
        }

        // Hinder och lösningar
        log += '🚧 HINDER OCH LÖSNINGAR\n';
        log += '-'.repeat(40) + '\n';
        if (game.course?.obstacles && game.course.obstacles.length > 0) {
            game.course.obstacles.forEach((obstacle, index) => {
                const details = obstacleDetails[obstacle.obstacleId];
                const isCompleted = game.completedObstacles?.includes(obstacle.obstacleId);
                const solutions = game.completedObstaclesDetailed?.filter(s => s.obstacleId === obstacle.obstacleId) || [];

                log += `${index + 1}. Hinder: ${obstacle.obstacleId}\n`;
                log += `   📍 Position: ${obstacle.latitude || 'N/A'}, ${obstacle.longitude || 'N/A'}\n`;
                log += `   📏 Radie: ${obstacle.radius || 15}m\n`;
                log += `   ✅ Status: ${isCompleted ? 'LÖST' : 'EJ LÖST'}\n`;

                if (details) {
                    if (details.error) {
                        log += `   ⚠️  Fel: ${details.error}\n`;
                    } else {
                        log += `   📝 Titel: ${details.title || 'N/A'}\n`;
                        log += `   ❓ Fråga: ${details.question || 'N/A'}\n`;
                        log += `   ✔️  Rätt svar: ${details.correctAnswer || 'N/A'}\n`;
                        if (details.options && details.options.length > 0) {
                            log += `   📋 Alternativ: ${details.options.join(', ')}\n`;
                        }
                    }
                }

                if (solutions.length > 0) {
                    log += `   🏆 LÖSNINGAR (${solutions.length} st):\n`;
                    solutions.forEach((solution, solIndex) => {
                        const solver = teamMembers?.find(m => m.uid === solution.solvedBy);
                        log += `      ${solIndex + 1}. Löst av: ${solution.solverName || solver?.displayName || 'Okänd'}\n`;
                        log += `         🕐 Tid: ${formatTimestamp(solution.solvedAt)}\n`;
                        log += `         👤 Lösar-UID: ${solution.solvedBy}\n`;
                        log += `         ✅ Var aktiv: ${solution.solverWasActive !== false ? 'JA' : 'NEJ'}\n`;
                        if (solution.activePlayersWhenSolved) {
                            log += `         👥 Aktiva spelare vid lösning: ${solution.activePlayersWhenSolved.map(p => p.name).join(', ')}\n`;
                        }
                    });
                } else if (isCompleted) {
                    log += `   ⚠️  Hinder markerat som löst men ingen detaljerad lösningsdata tillgänglig\n`;
                }
                log += '\n';
            });
        } else {
            log += '   Inga hinder på denna bana\n\n';
        }

        // Spelstatus och framsteg
        log += '📊 SPELFRAMSTEG SAMMANFATTNING\n';
        log += '-'.repeat(40) + '\n';
        const totalObstacles = game.course?.obstacles?.length || 0;
        const completedObstacles = game.completedObstacles?.length || 0;
        const activeObstacle = game.activeObstacleId || 'Inget';

        log += `🎯 Framsteg: ${completedObstacles}/${totalObstacles} hinder lösta\n`;
        log += `🔄 Aktivt hinder: ${activeObstacle}\n`;
        log += `👥 Spelare som nått mål: ${game.playersAtFinish?.length || 0}/${teamMembers?.length || 0}\n`;
        log += `🏁 Alla aktiva nådde mål: ${game.allPlayersFinished ? 'JA' : 'NEJ'}\n\n`;

        // KRONOLOGISK SPELHISTORIK
        log += '⏰ KRONOLOGISK SPELHISTORIK\n';
        log += '-'.repeat(40) + '\n';
        log += 'Alla händelser i spelet sorterade efter tid:\n\n';

        // Samla alla händelser med tidsstämplar
        const events = [];

        // 1. Spel skapat
        if (game.createdAt) {
            events.push({
                timestamp: game.createdAt,
                type: 'game_created',
                description: `🎮 Spel "${game.course?.name}" skapat`,
                player: null,
                details: `Lag: ${team.name}, Spel-ID: ${game.id || gameId}`
            });
        }

        // 2. Spel startat
        if (game.startTime) {
            events.push({
                timestamp: game.startTime,
                type: 'game_started',
                description: '🚀 Spelet startat',
                player: null,
                details: game.status === 'started' ? 'Status: Aktivt spel' : `Status: ${game.status}`
            });
        }

        // 3. Alla lösningsförsök (både korrekta och inkorrekta)
        if (game.completedObstaclesDetailed && game.completedObstaclesDetailed.length > 0) {
            game.completedObstaclesDetailed.forEach((solution, index) => {
                const solver = teamMembers?.find(m => m.uid === solution.solvedBy);
                const obstacleDetail = obstacleDetails[solution.obstacleId];

                events.push({
                    timestamp: solution.solvedAt,
                    type: 'obstacle_solved',
                    description: `🧩 Hinder löst: ${solution.obstacleId}`,
                    player: solution.solverName || solver?.displayName || 'Okänd spelare',
                    playerId: solution.solvedBy,
                    details: `Fråga: "${obstacleDetail?.question || 'N/A'}" | Aktiva vid lösning: ${solution.activePlayersWhenSolved ? solution.activePlayersWhenSolved.map(p => p.name).join(', ') : 'N/A'}`
                });
            });
        }

        // 4. Spelarpositioner (senaste kända positioner)
        Object.entries(playerPositions).forEach(([playerId, data]) => {
            if (data.lastUpdate) {
                const player = teamMembers?.find(m => m.uid === playerId);
                events.push({
                    timestamp: data.lastUpdate,
                    type: 'player_position',
                    description: '📍 Spelarposition uppdaterad',
                    player: player?.displayName || playerId,
                    playerId: playerId,
                    details: `Position: ${data.position?.latitude?.toFixed(6) || 'N/A'}, ${data.position?.longitude?.toFixed(6) || 'N/A'} | Status: ${data.isActive ? 'Aktiv' : 'Inaktiv'}`
                });
            }
        });

        // 5. Spelare som nått mål
        if (game.playersAtFinish && game.playersAtFinish.length > 0) {
            game.playersAtFinish.forEach(playerId => {
                const player = teamMembers?.find(m => m.uid === playerId);
                // Vi har inte exakt tidstämpel för när de nådde målet, så vi uppskattar baserat på endTime eller senaste aktivitet
                const estimatedTime = game.endTime || new Date();
                events.push({
                    timestamp: estimatedTime,
                    type: 'player_finished',
                    description: '🏁 Spelare nådde mål',
                    player: player?.displayName || 'Okänd spelare',
                    playerId: playerId,
                    details: `Aktivitetsstatus: ${playerPositions[playerId]?.isActive ? 'Aktiv' : 'Inaktiv'}`
                });
            });
        }

        // 6. Spel avslutat
        if (game.endTime) {
            events.push({
                timestamp: game.endTime,
                type: 'game_ended',
                description: '🏁 Spelet avslutat',
                player: null,
                details: `Slutstatus: ${game.status} | Alla aktiva spelare i mål: ${game.allPlayersFinished ? 'JA' : 'NEJ'}`
            });
        }

        // Sortera händelser kronologiskt
        events.sort((a, b) => {
            const timeA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
            const timeB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
            return timeA - timeB;
        });

        // Visa händelser
        if (events.length > 0) {
            events.forEach((event, index) => {
                const timeFormatted = formatTimestamp(event.timestamp);
                const playerInfo = event.player ? ` (${event.player})` : '';

                log += `${index + 1}. [${timeFormatted}] ${event.description}${playerInfo}\n`;
                if (event.details) {
                    log += `   📋 ${event.details}\n`;
                }
                log += '\n';
            });
        } else {
            log += '   Inga händelser registrerade\n\n';
        }

        // Sammanfattande statistik
        log += '📈 AKTIVITETSSTATISTIK\n';
        log += '-'.repeat(40) + '\n';
        const eventTypes = events.reduce((acc, event) => {
            acc[event.type] = (acc[event.type] || 0) + 1;
            return acc;
        }, {});

        const typeNames = {
            'game_created': 'Spel skapat',
            'game_started': 'Spel startat',
            'obstacle_solved': 'Hinder lösta',
            'player_position': 'Positionsuppdateringar',
            'player_finished': 'Spelare i mål',
            'game_ended': 'Spel avslutat'
        };

        Object.entries(eventTypes).forEach(([type, count]) => {
            log += `   ${typeNames[type] || type}: ${count} händelser\n`;
        });

        // Beräkna speltid om möjligt
        if (game.startTime && (game.endTime || events.length > 0)) {
            const endTime = game.endTime || events[events.length - 1]?.timestamp;
            if (endTime) {
                const totalTime = formatDuration(game.startTime, endTime);
                log += `   ⏱️  Total speltid: ${totalTime}\n`;
            }
        }

        log += '\n';

        // Teknisk information
        log += '⚙️  TEKNISK INFORMATION\n';
        log += '-'.repeat(40) + '\n';
        log += `🆔 Firebase Game ID: ${game.id || gameId}\n`;
        log += `🆔 Team ID: ${team.id}\n`;
        log += `🆔 Course ID: ${game.courseId || 'N/A'}\n`;
        log += `📊 Totala positionsuppdateringar: ${Object.keys(playerPositions).length}\n`;

        // Player positions details
        if (Object.keys(playerPositions).length > 0) {
            log += `\n📍 SENASTE POSITIONSDATA:\n`;
            Object.entries(playerPositions).forEach(([playerId, data]) => {
                const player = teamMembers?.find(m => m.uid === playerId);
                log += `   ${player?.displayName || playerId}:\n`;
                log += `     📍 Lat/Lng: ${data.position?.latitude?.toFixed(6) || 'N/A'}, ${data.position?.longitude?.toFixed(6) || 'N/A'}\n`;
                log += `     🕐 Uppdatering: ${data.lastUpdateFormatted}\n`;
                log += `     ✅ Aktiv: ${data.isActive ? 'JA' : 'NEJ'}\n`;
            });
        }

        // Eventuella fel eller varningar
        log += '\n⚠️  EVENTUELLA PROBLEM\n';
        log += '-'.repeat(40) + '\n';
        let hasIssues = false;

        // Status och startTime-problem
        if (!game.startTime && game.status !== 'pending') {
            log += `❌ Status-problem: Spelet har status '${game.status}' men ingen startTime\n`;
            if (game.completedObstaclesDetailed && game.completedObstaclesDetailed.length > 0) {
                log += `   💡 Förslag: Spelet har lösningar men startades aldrig korrekt\n`;
                log += `   💡 Lösning: Systemet bör sätta startTime till första lösningens tidpunkt\n`;
            }
            hasIssues = true;
        }

        // Inkonsekvens mellan completedObstacles och completedObstaclesDetailed
        if (game.completedObstacles?.length !== game.completedObstaclesDetailed?.length) {
            log += `⚠️  Data-inkonsekvens: completedObstacles (${game.completedObstacles?.length || 0}) vs completedObstaclesDetailed (${game.completedObstaclesDetailed?.length || 0})\n`;

            // Analysera vad som är fel
            if ((game.completedObstacles?.length || 0) === 0 && (game.completedObstaclesDetailed?.length || 0) > 0) {
                log += `   💡 Orsak: completedObstacles är tom trots att det finns detaljerade lösningar\n`;
                log += `   💡 Lösning: Systemet bör synkronisera completedObstacles baserat på aktiva spelares giltiga lösningar\n`;
            } else if ((game.completedObstacles?.length || 0) > (game.completedObstaclesDetailed?.length || 0)) {
                log += `   💡 Orsak: completedObstacles har fler poster än detaljerade lösningar\n`;
                log += `   💡 Lösning: Rensa completedObstacles eller lägg till saknade detaljer\n`;
            }
            hasIssues = true;
        }

        // Kontrollera om lösningar är giltiga (lösta av aktiva spelare)
        if (game.completedObstaclesDetailed && teamMembers) {
            const invalidSolutions = game.completedObstaclesDetailed.filter(solution => {
                const solver = teamMembers.find(m => m.uid === solution.solvedBy);
                return solver && !solver.isActive;
            });

            if (invalidSolutions.length > 0) {
                log += `⚠️  Ogiltiga lösningar: ${invalidSolutions.length} lösningar av inaktiva spelare\n`;
                invalidSolutions.forEach((solution, index) => {
                    const solver = teamMembers.find(m => m.uid === solution.solvedBy);
                    log += `     ${index + 1}. ${solution.obstacleId} löst av ${solver?.displayName || 'okänd'} (nu inaktiv)\n`;
                });
                log += `   💡 Lösning: Systemet bör ignorera lösningar från inaktiva spelare\n`;
                hasIssues = true;
            }
        }

        // Inaktiva spelare som nått mål
        const inactiveButAtFinish = game.playersAtFinish?.filter(playerId => {
            const playerData = playerPositions[playerId];
            return playerData && !playerData.isActive;
        });

        if (inactiveButAtFinish && inactiveButAtFinish.length > 0) {
            log += `⚠️  Inaktiva spelare som nått mål: ${inactiveButAtFinish.length}\n`;
            inactiveButAtFinish.forEach(playerId => {
                const player = teamMembers?.find(m => m.uid === playerId);
                log += `     - ${player?.displayName || playerId}\n`;
            });
            hasIssues = true;
        }

        if (!hasIssues) {
            log += '✅ Inga uppenbara problem upptäckta\n';
            log += '✅ Speldata verkar konsekvent och korrekt\n';
        }

        log += '\n' + '='.repeat(80) + '\n';
        log += '                              SLUT PÅ RAPPORT\n';
        log += '='.repeat(80) + '\n';

        return log;
    }, [gameId, formatTimestamp, formatDuration]);

    const exportGameLog = useCallback(async () => {
        if (!gameId || !game || !team) {
            alert('Speldata inte tillgänglig för export');
            return;
        }

        try {
            // Samla all speldata
            const gameData = { ...game };

            // Hämta spelarpositioner från subcollection
            const playersSnapshot = await getDocs(collection(db, 'games', gameId, 'players'));
            const playerPositions = {};
            playersSnapshot.forEach(doc => {
                playerPositions[doc.id] = {
                    id: doc.id,
                    ...doc.data(),
                    lastUpdateFormatted: formatTimestamp(doc.data().lastUpdate)
                };
            });

            // Hämta detaljerad information om hinder
            const obstacleDetails = {};
            if (game.course?.obstacles) {
                for (const obstacle of game.course.obstacles) {
                    try {
                        const obstacleDoc = await getDoc(doc(db, 'obstacles', obstacle.obstacleId));
                        if (obstacleDoc.exists()) {
                            obstacleDetails[obstacle.obstacleId] = {
                                ...obstacleDoc.data(),
                                locationInCourse: obstacle
                            };
                        }
                    } catch (error) {
                        console.warn(`Kunde inte hämta hinder ${obstacle.obstacleId}:`, error);
                        obstacleDetails[obstacle.obstacleId] = {
                            error: `Kunde inte hämta hinderdata: ${error.message}`,
                            locationInCourse: obstacle
                        };
                    }
                }
            }

            // Skapa detaljerad logg
            const logContent = generateDetailedLog({
                game: gameData,
                team,
                teamMembers,
                playerPositions,
                obstacleDetails,
                currentUser: user
            });

            // Skapa och ladda ner fil
            const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;

            const gameStatus = game.status || 'unknown';
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            link.download = `GeoQuest-${game.course?.name || 'Spel'}-${gameStatus}-${timestamp}.log`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Fel vid export av speldata:', error);
            alert(`Fel vid export: ${error.message}`);
        }
    }, [gameId, game, team, teamMembers, user, generateDetailedLog, formatTimestamp]);

    return {
        exportGameLog
    };
};

export default GameLogger;