// src/components/player/DebugGameControls.js
import React, { useState, useMemo, useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const DebugGameControls = ({ game, course, team, user, gameId, onSimulatePosition, addLogMessage }) => {
    const [isSimulating, setIsSimulating] = useState(false);

    const simulatePlayerMovement = useCallback(async (playerId, startCoords, endCoords, steps = 20, duration = 2000) => {
        const latStep = (endCoords.lat - startCoords.lat) / steps;
        const lngStep = (endCoords.lng - startCoords.lng) / steps;

        for (let i = 1; i <= steps; i++) {
            const currentLat = startCoords.lat + latStep * i;
            const currentLng = startCoords.lng + lngStep * i;
            
            if (playerId === user.uid) {
                onSimulatePosition({ lat: currentLat, lng: currentLng });
            } else {
                 const gameRef = doc(db, 'games', gameId);
                 await updateDoc(gameRef, {
                    [`playerPositions.${playerId}`]: { lat: currentLat, lng: currentLng }
                });
            }
            await new Promise(res => setTimeout(res, duration / steps));
        }
    }, [user, gameId, onSimulatePosition]);
    
    // FIX: Lade till 'simulatePlayerMovement' i dependency array.
    const turnInfo = useMemo(() => {
        if (!game || !team || !course || !course.obstacles) return { canPlay: false, actionText: "Väntar på data..." };

        const allMembers = team.memberIds || [];
        const leader = team.leaderId;
        const otherMembers = allMembers.filter(id => id !== leader);
        const solvedCount = game.solvedObstacles.filter(Boolean).length;
        
        // Målgångsfasen
        if (solvedCount === course.obstacles.length) {
            const hasFinished = (game.playersAtFinish || []).includes(user.uid);
            if (hasFinished) return { canPlay: false, actionText: "Du är i mål!" };
            
            return {
                canPlay: true,
                actionText: `Gå till Mål`,
                action: async () => {
                    const startPos = game.playerPositions[user.uid] || course.start;
                    await simulatePlayerMovement(user.uid, startPos, course.finish);
                }
            };
        }

        // Hinderfasen
        const nextPlayerIndex = solvedCount;
        let currentPlayerId;
        if (nextPlayerIndex === 0) {
            currentPlayerId = leader;
        } else {
            const memberIndex = nextPlayerIndex - 1;
            currentPlayerId = memberIndex < otherMembers.length ? otherMembers[memberIndex] : leader;
        }
        
        if (user.uid === currentPlayerId) {
             return {
                canPlay: true,
                actionText: `Gå till Hinder ${nextPlayerIndex + 1}`,
                action: async () => {
                    const startPos = game.playerPositions[user.uid] || course.start;
                    await simulatePlayerMovement(user.uid, startPos, course.obstacles[nextPlayerIndex].position);
                }
            };
        }

        return { canPlay: false, actionText: "Väntar på din tur..." };
    }, [game, team, course, user.uid, simulatePlayerMovement]);
    
    if (process.env.NODE_ENV !== 'development' || !game || game.status !== 'started') {
        return null;
    }

    const handleSimulateNextStep = async () => {
        if (!turnInfo.action || isSimulating) return;
        setIsSimulating(true);
        addLogMessage(`Simulerar: ${turnInfo.actionText}...`);
        await turnInfo.action();
        setIsSimulating(false);
    };

    return (
        <div className="fixed bottom-4 right-4 z-[1000] p-3 sc-card">
            <h3 className="font-bold text-sm mb-2">Debug-panel</h3>
            <button
                onClick={handleSimulateNextStep}
                disabled={!turnInfo.canPlay || isSimulating}
                className="sc-button"
            >
                {isSimulating ? 'Simulerar...' : turnInfo.actionText}
            </button>
        </div>
    );
};

export default DebugGameControls;
