import React from 'react';
import { createPlayerIcon, leaderIcon } from '../shared/MapIcons';

const PlayerLegend = ({ team, teamMembers, gameId, game, onClose }) => {

    if (!team || !teamMembers) return null;

    // Skapa en mapping av spelare till deras position i teamet (för ikon-index)
    const getPlayerIcon = (userId, isLeader, memberIndex) => {
        if (isLeader) return leaderIcon;
        return createPlayerIcon(memberIndex);
    };

    // Kontrollera vilka spelare som är aktiva (har gått med i spelet)
    const getPlayerStatus = (userId) => {
        const member = teamMembers.find(m => m.uid === userId);

        // Spelaren måste ha position-data för att ha varit med i spelet
        if (!member || !member.position) {
            return false;
        }

        // Använd isActive-flaggan som sätts via browser events
        // Detta är mer exakt än timeout eftersom det reagerar direkt
        return member.isActive === true;
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black bg-opacity-75">
            <div className="bg-background-light rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-accent-cyan">Lagmedlemmar & Ikoner</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-2xl"
                    >
                        ×
                    </button>
                </div>

                <div className="space-y-3">
                    {team.memberIds.map((memberId, index) => {
                        const member = teamMembers.find(m => m.uid === memberId);
                        const isLeader = memberId === team.leaderId;
                        const isActive = getPlayerStatus(memberId);
                        const icon = getPlayerIcon(memberId, isLeader, index);

                        return (
                            <div
                                key={memberId}
                                className={`flex items-center space-x-3 p-3 rounded-lg ${
                                    isActive ? 'bg-black bg-opacity-40' : 'bg-gray-600 bg-opacity-30'
                                }`}
                            >
                                {/* Ikon förhandsvisning */}
                                <div
                                    className={`flex-shrink-0 ${isActive ? '' : 'opacity-50 grayscale'}`}
                                    dangerouslySetInnerHTML={{ __html: icon.options.html }}
                                />

                                {/* Spelarinformation */}
                                <div className="flex-1">
                                    <div className={`font-medium ${isActive ? 'text-white' : 'text-gray-400'}`}>
                                        {member?.displayName || 'Okänd spelare'}
                                        {isLeader && <span className="ml-2 text-accent-yellow text-sm">(Lagledare)</span>}
                                    </div>
                                    <div className={`text-sm ${isActive ? 'text-green-400' : 'text-gray-500'}`}>
                                        {isActive ? 'Aktiv i spel' : 'Inte med i spel än'}
                                    </div>
                                </div>

                                {/* Status indikator */}
                                <div className={`w-3 h-3 rounded-full ${
                                    isActive ? 'bg-green-400' : 'bg-gray-500'
                                }`} />
                            </div>
                        );
                    })}
                </div>

                <div className="mt-6 text-center">
                    <button
                        onClick={onClose}
                        className="sc-button sc-button-blue px-6"
                    >
                        Stäng
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PlayerLegend;