import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebug } from '../../context/DebugContext'; // Importerar debug-verktyget

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
        <div className="absolute top-0 left-0 right-0 z-[1000] bg-background-light p-4 shadow-lg flex justify-between items-center border-b-4 border-primary">
            <div className="flex-1">
                <h1 className="text-xl font-bold text-text-primary">{gameName}</h1>
                <p className="text-xl font-bold text-white bg-accent-cyan px-3 py-1 rounded-md inline-block">{teamName}</p>
            </div>
            <div className="flex-1 text-center">
                <div className="inline-block bg-black bg-opacity-80 px-6 py-3 rounded-lg border-2 border-accent-yellow">
                    <div className="text-xs uppercase text-accent-yellow font-bold mb-1">TID</div>
                    <div className="text-4xl font-mono text-white font-bold tracking-wider">
                        {formatTime(elapsedTime)}
                    </div>
                </div>
            </div>
            <div className="flex-1 flex justify-end">
                <button
                    onClick={() => navigate('/teams')}
                    className="sc-button sc-button-red"
                    aria-label="Avsluta spelet"
                >
                    Avsluta
                </button>
            </div>
        </div>
    );
};

export default GameHeader;