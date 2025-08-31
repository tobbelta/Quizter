import React from 'react';
// Importera den nya genvägen för att hämta debug-status
import { useDebug } from '../../context/DebugContext';
import { useGameSimulation } from '../../hooks/useGameSimulation';

const DebugGameControls = ({ game, course, onSimulatePosition, addLogMessage }) => {
    // Använd den centrala statusen istället för lokal logik
    const { isDebugMode } = useDebug();

    const { isSimulating, simulationStatus, startSimulation } = useGameSimulation(
        game,
        course,
        (pos) => {
            onSimulatePosition(pos);
            // **KORRIGERING:** Lade till backticks (`) för att skapa en korrekt
            // JavaScript-sträng (template literal). Detta löser syntaxfelet.
            addLogMessage(`Simulerar position: ${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}`);
        }
    );

    // Om vi inte är i debug-läge, rendera ingenting
    if (!isDebugMode) {
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

