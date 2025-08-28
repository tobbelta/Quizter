import React, { useState, useMemo } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const DebugGameControls = ({ game, course, team, user, gameId, onSimulatePosition }) => {
    const [isSimulating, setIsSimulating] = useState(false);

    const getRandomCoordinate = (startCoords, radiusInMeters) => {
        const r = radiusInMeters * Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const dy = r * Math.sin(theta);
        const dx = r * Math.cos(theta);
        const newLat = startCoords.lat + dy / 111132;
        const newLng = startCoords.lng + dx / (111320 * Math.cos(startCoords.lat * Math.PI / 180));
        return { lat: newLat, lng: newLng };
    };

    const simulatePlayerMovement = async (playerId, startCoords, endCoords, steps = 20, duration = 2000) => {
        const latStep = (endCoords.lat - startCoords.lat) / steps;
        const lngStep = (endCoords.lng - startCoords.lng) / steps;
        for (let i = 1; i <= steps; i++) {
            const currentLat = startCoords.lat + latStep * i;
            const currentLng = startCoords.lng + lngStep * i;
            
            // Om det är den inloggade användaren som rör sig, uppdatera den lokala state
            if (playerId === user.uid) {
                onSimulatePosition({ latitude: currentLat, longitude: currentLng });
            } else {
                // Annars, uppdatera bara databasen för andra spelare
                const gameRef = doc(db, 'games', gameId);
                await updateDoc(gameRef, {
                    [`playerPositions.${playerId}`]: { lat: currentLat, lng: currentLng }
                });
            }
            await new Promise(res => setTimeout(res, duration / steps));
        }
    };

    const { buttonText, isDisabled, action } = useMemo(() => {
        if (!game || !team || !course || !user) return { isDisabled: true, buttonText: 'Laddar...' };

        const leader = team.leaderId;
        const otherMembers = team.memberIds.filter(id => id !== leader);
        const nextUnsolvedIndex = game.solvedObstacles.findIndex(s => !s);
        const allObstaclesSolved = nextUnsolvedIndex === -1;

        if (game.status === 'pending') {
            return {
                buttonText: 'Gå till Start',
                isDisabled: user.uid !== leader,
                action: async () => {
                    const startPosition = game.playerPositions[leader] || getRandomCoordinate(course.start, 90);
                    await simulatePlayerMovement(leader, startPosition, course.start);
                }
            };
        }

        if (!allObstaclesSolved) {
            let currentPlayerId;
            if (nextUnsolvedIndex === 0) {
                currentPlayerId = leader;
            } else {
                const memberIndex = nextUnsolvedIndex - 1;
                currentPlayerId = (memberIndex < otherMembers.length) ? otherMembers[memberIndex] : leader;
            }
            
            return {
                buttonText: `Gå till Hinder ${nextUnsolvedIndex + 1}`,
                isDisabled: user.uid !== currentPlayerId,
                action: async () => {
                    const targetObstacle = course.obstacles[nextUnsolvedIndex];
                    const startPosition = game.playerPositions[currentPlayerId] || course.start;
                    await simulatePlayerMovement(currentPlayerId, startPosition, { lat: targetObstacle.lat, lng: targetObstacle.lng });
                }
            };
        }

        if (allObstaclesSolved) {
            const playersNotAtFinish = team.memberIds.filter(id => !game.playersAtFinish.includes(id));
            if (playersNotAtFinish.length > 0) {
                let currentPlayerId;
                if (playersNotAtFinish.includes(leader)) {
                    currentPlayerId = leader;
                } else {
                    currentPlayerId = playersNotAtFinish[0];
                }

                return {
                    buttonText: 'Gå till Mål',
                    isDisabled: user.uid !== currentPlayerId,
                    action: async () => {
                        const startPosition = game.playerPositions[currentPlayerId] || course.start;
                        await simulatePlayerMovement(currentPlayerId, startPosition, course.finish);
                    }
                };
            }
        }

        return { buttonText: 'Spel Avklarat', isDisabled: true, action: () => {} };

    }, [game, course, team, user]);

    if (process.env.NODE_ENV !== 'development') {
        return null;
    }

    const handleSimulate = async () => {
        if (isDisabled || isSimulating || !action) return;
        setIsSimulating(true);
        await action();
        setIsSimulating(false);
    };

    return (
        <div className="fixed bottom-4 right-4 z-[1000] bg-white p-3 rounded-lg shadow-lg border">
            <h3 className="font-bold text-sm mb-2">Debug-panel</h3>
            <button
                onClick={handleSimulate}
                disabled={isDisabled || isSimulating}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:bg-gray-400"
            >
                {isSimulating ? 'Simulerar...' : buttonText}
            </button>
        </div>
    );
};

export default DebugGameControls;
