import React, { useRef, useEffect } from 'react';

// Denna komponent renderas bara i utvecklingsmiljö
const DebugLogDisplay = ({ messages }) => {
    const logContainerRef = useRef(null);

    // Skrolla automatiskt till botten när nya meddelanden läggs till
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [messages]);

    if (process.env.NODE_ENV !== 'development') {
        return null;
    }

    return (
        <div 
            ref={logContainerRef}
            className="fixed bottom-4 left-4 z-[1000] bg-black bg-opacity-75 text-white text-xs font-mono p-3 rounded-lg shadow-lg w-80 h-48 overflow-y-auto"
        >
            <p className="text-green-400 border-b border-gray-600 pb-1 mb-2">DEBUG LOG</p>
            {messages.map((msg, index) => (
                <p key={index} className="whitespace-pre-wrap">{`> ${msg}`}</p>
            ))}
        </div>
    );
};

export default DebugLogDisplay;
