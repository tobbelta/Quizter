import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useGameSimulation } from '../../hooks/useGameSimulation';

const DebugGameControls = ({ game, course, onSimulatePosition, addLogMessage }) => {
    const location = useLocation();
    const [isDebugVisible, setIsDebugVisible] = useState(false);

    // useEffect körs när komponenten laddas och när URL:en ändras.
    useEffect(() => {
        // Kontrollerar om ?debug=true finns i den aktuella URL:en.
        const queryParams = new URLSearchParams(location.search);
        const hasDebugQuery = queryParams.get('debug') === 'true';

        // Om flaggan finns, spara den i webbläsarens minne för denna session.
        if (hasDebugQuery) {
            sessionStorage.setItem('geoquest-debug-mode', 'true');
        }

        // Hämta det sparade värdet från minnet.
        const isDebugSession = sessionStorage.getItem('geoquest-debug-mode') === 'true';

        // Knapparna ska visas om något av villkoren är uppfyllda.
        const shouldBeVisible =
            process.env.NODE_ENV === 'development' ||
            window.location.hostname === 'localhost' ||
            isDebugSession;

        setIsDebugVisible(shouldBeVisible);
    }, [location.search]); // Kör om effekten om URL:en ändras.

    const { isSimulating, simulationStatus, startSimulation } = useGameSimulation(
        game,
        course,
        (pos) => {
            onSimulatePosition(pos);
            addLogMessage(`Simulerar position: ${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}`);
        }
    );

    // Om vi inte ska visa kontrollerna, rendera ingenting.
    if (!isDebugVisible) {
        return null;
    }

    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] p-2 neu-card flex flex-col items-center gap-2 w-11/12 max-w-sm">
            <h3 className="font-bold text-lg text-accent-yellow">Debug-kontroller</h3>
            <div className="w-full">
                <button
                    onClick={startSimulation}
                    disabled={isSimulating}
                    className="neu-button neu-button-green w-full"
                >
                    {isSimulating ? 'Simulerar...' : 'Nästa Sim-steg'}
                </button>
            </div>
            <p className="text-sm text-text-secondary w-full text-center bg-background p-1 rounded">
                Status: <span className="font-bold text-text-primary">{simulationStatus}</span>
            </p>
        </div>
    );
};

export default DebugGameControls;

