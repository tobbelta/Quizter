import React, { useState, useEffect } from 'react';
import { useDebug } from '../../context/DebugContext'; // Importerar debug-verktyget
import Logo from '../shared/Logo';
import HamburgerMenu from '../shared/HamburgerMenu';

// Funktion för att formatera sekunder till HH:MM:SS
const formatTime = (seconds) => {
    // Skyddsnät ifall värdet är ogiltigt eller negativt
    if (isNaN(seconds) || seconds < 0) {
        return '00:00:00';
    }
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (Math.floor(seconds) % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

// Funktion för att bestämma nästa uppgift baserat på spelstatus och roll
const getNextObjective = (game, team, user) => {
    if (!game || !team || !user) return "Laddar...";

    const isLeader = user.uid === team.leaderId;

    // Om spelet inte har startat
    if (game.status === 'pending') {
        return isLeader ? "Gå till start" : "Vänta på lagledaren";
    }

    if (game.status === 'ready' && !game.startTime) {
        return isLeader ? "Starta spelet" : "Vänta på start";
    }

    // Om spelet har startat
    if (game.status === 'started') {
        const totalObstacles = game.course?.obstacles?.length || 0;
        const completedCount = game.completedObstacles?.length || 0;

        if (completedCount < totalObstacles) {
            return `Hinder ${completedCount + 1}`;
        } else {
            return "Gå till mål";
        }
    }

    if (game.status === 'finished') {
        return "Spelet avslutat";
    }

    return "Okänt status";
};

const GameHeader = ({ gameName, teamName, startTime, gameFinished = false, game, team, user, teamMembers }) => {
    const [elapsedTime, setElapsedTime] = useState(0);
    const { addLog } = useDebug(); // Hämtar loggfunktionen från kontexten

    useEffect(() => {
        // Loggar varje gång komponenten uppdateras och vad 'startTime' är
        addLog(`GameHeader renderar. startTime: ${startTime ? startTime.toISOString() : 'ej satt'}, gameFinished: ${gameFinished}`);

        let timerInterval = null;

        // Kontrollerar att startTime är ett giltigt Datum-objekt och att spelet inte är avslutat
        if (startTime instanceof Date && !isNaN(startTime) && !gameFinished) {
            addLog('Giltig starttid mottagen. Startar timer...');

            // Sätter igång en timer som uppdateras varje sekund
            timerInterval = setInterval(() => {
                const now = new Date();
                const elapsed = Math.floor((now - startTime) / 1000);
                setElapsedTime(elapsed);
            }, 1000);

        } else if (startTime) {
            if (gameFinished) {
                addLog('Spelet är avslutat - timer stoppar');
            } else {
                // Loggar en varning om vi får ett startTime som inte är ett giltigt datum
                addLog(`VARNING: Mottog startTime som inte är ett giltigt datum: ${startTime}`);
            }
        }

        // "Städfunktion" som körs när komponenten försvinner eller 'startTime' ändras
        return () => {
            if (timerInterval) {
                addLog('Rensar och stoppar timer-intervallet.');
                clearInterval(timerInterval);
            }
        };
    }, [startTime, gameFinished, addLog]); // Effekt-hooken körs om när 'startTime', 'gameFinished' eller 'addLog' ändras

    return (
        <div className="absolute top-0 left-0 right-0 z-[1000] bg-black bg-opacity-90 px-2 py-1 shadow-lg border-b border-primary h-8">
            <div className="flex items-center justify-between h-full">
                {/* Vänster: Logo och namn */}
                <div className="flex items-center gap-1 flex-1 min-w-0">
                    <Logo size={12} className="flex-shrink-0" />
                    <div className="text-xs text-white font-medium truncate">
                        {gameName} | {teamName}
                    </div>
                </div>

                {/* Mitten: Nästa uppgift */}
                <div className="flex-shrink-0">
                    <div className="bg-gradient-to-r from-cyan-600 to-blue-600 px-1.5 py-0.5 rounded text-xs text-white font-bold">
                        {getNextObjective(game, team, user)}
                    </div>
                </div>

                {/* Höger: Timer och hamburger */}
                <div className="flex items-center gap-1 flex-1 justify-end min-w-0">
                    <div className="text-xs text-white font-mono">
                        {formatTime(elapsedTime)}
                    </div>
                    <HamburgerMenu teamMembers={teamMembers}>
                    </HamburgerMenu>
                </div>
            </div>
        </div>
    );
};

export default GameHeader;