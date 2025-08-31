import React, { createContext, useState, useEffect, useContext } from 'react';
import { useLocation } from 'react-router-dom';

// Skapar en central plats (Context) för att lagra debug-status
const DebugContext = createContext();

// Skapar en genväg (custom hook) för att enkelt komma åt statusen
export const useDebug = () => {
    return useContext(DebugContext);
};

// Detta är komponenten som kommer att hålla koll på och dela ut debug-statusen
export const DebugProvider = ({ children }) => {
    const [isDebugMode, setIsDebugMode] = useState(false);
    const location = useLocation();

    useEffect(() => {
        // Känner av om ?debug=true finns i URL:en
        const queryParams = new URLSearchParams(location.search);
        const hasDebugQuery = queryParams.get('debug') === 'true';

        // Om ja, spara det i webbläsarens minne
        if (hasDebugQuery) {
            sessionStorage.setItem('geoquest-debug-mode', 'true');
        }

        // Kontrollerar alla villkor för att se om debug-läget ska vara aktivt
        const isDebugSession = sessionStorage.getItem('geoquest-debug-mode') === 'true';
        const shouldBeDebug =
            process.env.NODE_ENV === 'development' ||
            window.location.hostname === 'localhost' ||
            isDebugSession;

        setIsDebugMode(shouldBeDebug);
    }, [location.search]);

    // Gör isDebugMode-värdet tillgängligt för hela appen
    return (
        <DebugContext.Provider value={{ isDebugMode }}>
            {children}
        </DebugContext.Provider>
    );
};
