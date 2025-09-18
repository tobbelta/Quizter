import React from 'react';
import { useDebug } from '../../context/DebugContext';

const DebugBanner = () => {
    const { isDebug, setDebugMode } = useDebug();

    // Om vi inte är i debug-läge, visa ingenting.
    if (!isDebug) {
        return null;
    }

    // Funktion för att stänga av debug-läget och ladda om sidan.
    const handleTurnOffDebug = () => {
        setDebugMode(false);
        window.location.reload(); 
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-yellow-400 text-black p-2 text-center text-sm font-bold z-[2000] flex justify-center items-center gap-4">
            <span>
                <i className="fas fa-bug mr-2"></i>
                DEBUG-LÄGE AKTIVT (Positionen är simulerad)
            </span>
            <button 
                onClick={handleTurnOffDebug}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1 px-2 rounded"
                title="Stäng av och ladda om"
            >
                STÄNG AV
            </button>
        </div>
    );
};

export default DebugBanner;
