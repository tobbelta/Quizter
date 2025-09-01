import React, { useState, useEffect } from 'react';

const GameHeader = ({ gameName, startTime, teamName }) => {
    const [elapsedTime, setElapsedTime] = useState('00:00:00');

    useEffect(() => {
        if (!startTime) return;

        const timerInterval = setInterval(() => {
            const now = new Date();
            const diff = now - startTime;

            const hours = String(Math.floor(diff / 3600000)).padStart(2, '0');
            const minutes = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
            const seconds = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');

            setElapsedTime(`${hours}:${minutes}:${seconds}`);
        }, 1000);

        return () => clearInterval(timerInterval);
    }, [startTime]);

    return (
        <header className="absolute top-0 left-0 right-0 z-[1000] p-4 bg-black bg-opacity-50 text-white flex justify-between items-center">
            <div>
                <h1 className="text-xl font-bold">{gameName}</h1>
                <p className="text-sm text-gray-300">{teamName}</p>
            </div>
            <div className="text-2xl font-mono bg-gray-900 px-4 py-2 rounded-lg shadow-lg">
                {elapsedTime}
            </div>
        </header>
    );
};

export default GameHeader;
