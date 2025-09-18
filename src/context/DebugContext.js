import React, { createContext, useState, useContext, useCallback } from 'react';

export const DebugContext = createContext();

export const DebugProvider = ({ children }) => {
    const [isDebug, setIsDebug] = useState(() => sessionStorage.getItem('isDebug') === 'true');
    const [logs, setLogs] = useState([]);
    const [simulationSpeed, setSimulationSpeed] = useState('normal');

    const setDebugMode = useCallback((enabled) => {
        setIsDebug(enabled);
        sessionStorage.setItem('isDebug', enabled);
    }, []);

    const addLog = useCallback((message) => {
        setLogs(prevLogs => {
            const timestamp = new Date().toLocaleTimeString();
            const newLog = `[${timestamp}] ${message}`;
            return [newLog, ...prevLogs].slice(0, 50);
        });
    }, []);

    const clearLogs = useCallback(() => {
        setLogs([]);
    }, []);

    const value = {
        isDebug,
        setDebugMode,
        logs,
        addLog,
        clearLogs,
        simulationSpeed,
        setSimulationSpeed,
    };

    return (
        <DebugContext.Provider value={value}>
            {children}
        </DebugContext.Provider>
    );
};

export const useDebug = () => {
    const context = useContext(DebugContext);
    // **KORRIGERING:** Tar bort felsökningsloggen nu när problemet är hittat.
    if (context === undefined) {
        throw new Error('useDebug must be used within a DebugProvider');
    }
    return context;
};

