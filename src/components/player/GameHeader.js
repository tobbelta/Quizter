import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebug } from '../../context/DebugContext'; // Importerar debug-verktyget
import Logo from '../shared/Logo';

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

const GameHeader = ({ gameName, teamName, startTime }) => {
    const [elapsedTime, setElapsedTime] = useState(0);
    const navigate = useNavigate();
    const { addLog } = useDebug(); // Hämtar loggfunktionen från kontexten

    useEffect(() => {
        // Loggar varje gång komponenten uppdateras och vad 'startTime' är
        addLog(`GameHeader renderar. startTime: ${startTime ? startTime.toISOString() : 'ej satt'}`);

        let timerInterval = null;

        // Kontrollerar att startTime är ett giltigt Datum-objekt
        if (startTime instanceof Date && !isNaN(startTime)) {
            addLog('Giltig starttid mottagen. Startar timer...');
            
            // Sätter igång en timer som uppdateras varje sekund
            timerInterval = setInterval(() => {
                const now = new Date();
                const elapsed = Math.floor((now - startTime) / 1000);
                setElapsedTime(elapsed);
            }, 1000);

        } else if (startTime) {
            // Loggar en varning om vi får ett startTime som inte är ett giltigt datum
            addLog(`VARNING: Mottog startTime som inte är ett giltigt datum: ${startTime}`);
        }

        // "Städfunktion" som körs när komponenten försvinner eller 'startTime' ändras
        return () => {
            if (timerInterval) {
                addLog('Rensar och stoppar timer-intervallet.');
                clearInterval(timerInterval);
            }
        };
    }, [startTime, addLog]); // Effekt-hooken körs om när 'startTime' eller 'addLog' ändras

    return (
        <div className="absolute top-0 left-0 right-0 z-[1000] bg-background-light p-2 shadow-lg flex justify-between items-center border-b-2 border-primary">
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <Logo size={28} className="flex-shrink-0" />
                <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-black bg-opacity-80 px-2 py-1 rounded border border-primary">
                        <h1 className="text-xs sm:text-sm font-bold text-white truncate">{gameName}</h1>
                    </div>
                    <div className="bg-cyan-500 px-2 py-1 rounded border border-cyan-500">
                        <p className="text-xs sm:text-sm font-bold text-white truncate">{teamName}</p>
                    </div>
                </div>
            </div>
            <div className="flex-shrink-0 text-center mx-2">
                <div className="inline-block bg-black bg-opacity-80 px-3 py-1 rounded border border-accent-yellow">
                    <div className="text-sm sm:text-base font-mono text-white font-bold tracking-wider">
                        {formatTime(elapsedTime)}
                    </div>
                </div>
            </div>
            <div className="flex-shrink-0 flex justify-end">
                <button
                    onClick={() => navigate('/teams')}
                    className="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full transition-colors duration-200"
                    aria-label="Stäng spelet"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default GameHeader;