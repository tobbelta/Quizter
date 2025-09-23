import React, { useState, useRef, useEffect } from 'react';
import { getVersionString, getBuildInfo, checkForUpdates } from '../../version';

const HamburgerMenu = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [updateStatus, setUpdateStatus] = useState(null); // null, 'checking', 'available', 'none', 'error'
    const node = useRef();

    // Stäng menyn om man klickar utanför den
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (node.current && !node.current.contains(e.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        } else {
            document.removeEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    return (
        <div ref={node} className="relative z-[1001]">
            <button onClick={() => setIsOpen(!isOpen)} className="neu-button neu-button-secondary p-2 relative z-[1001]">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path>
                </svg>
            </button>

            {isOpen && (
                <div
                    className="absolute top-full right-0 mt-2 w-48 neu-card z-[1001] transition-all duration-300 ease-in-out"
                    style={{ transformOrigin: 'top right' }}
                >
                    <div className="flex flex-col gap-2">
                        {children}

                        {/* Versionsinformation */}
                        <div className="border-t-2 border-gray-300 pt-2 mt-2">
                            <div className="text-xs text-gray-300 px-2 py-1">
                                <div className="flex justify-between items-center">
                                    <span>Version: {getVersionString()}</span>
                                    <button
                                        onClick={async () => {
                                            setUpdateStatus('checking');

                                            try {
                                                const result = await checkForUpdates();

                                                if (result.hasUpdate) {
                                                    setUpdateStatus('available');
                                                    const confirmUpdate = window.confirm(
                                                        `Ny version tillgänglig!\n` +
                                                        `Nuvarande: ${result.currentVersion}\n` +
                                                        `Ny version: ${result.serverVersion}\n\n` +
                                                        `Vill du uppdatera nu?`
                                                    );

                                                    if (confirmUpdate) {
                                                        // Rensa cache och ladda om
                                                        if ('caches' in window) {
                                                            const cacheNames = await caches.keys();
                                                            await Promise.all(
                                                                cacheNames.map(cacheName => caches.delete(cacheName))
                                                            );
                                                        }

                                                        window.location.reload(true);
                                                    }
                                                } else if (result.error) {
                                                    setUpdateStatus('error');
                                                    alert(`Fel: ${result.error}`);
                                                } else {
                                                    setUpdateStatus('none');
                                                    const message = result.message || 'Du har redan den senaste versionen!';
                                                    alert(message);
                                                }
                                            } catch (error) {
                                                setUpdateStatus('error');
                                                alert(`Fel vid uppdateringskontroll: ${error.message}`);
                                            }

                                            // Återställ status efter 3 sekunder
                                            setTimeout(() => setUpdateStatus(null), 3000);
                                        }}
                                        disabled={updateStatus === 'checking'}
                                        className={`text-xs px-2 py-1 neu-button ${
                                            updateStatus === 'checking' ? 'neu-button-secondary' :
                                            updateStatus === 'available' ? 'neu-button-green' :
                                            updateStatus === 'none' ? 'neu-button-secondary' :
                                            updateStatus === 'error' ? 'neu-button-red' :
                                            'neu-button-blue'
                                        }`}
                                        title="Kontrollera om ny version finns"
                                    >
                                        {updateStatus === 'checking' ? '🔄 Kollar...' :
                                         updateStatus === 'available' ? '⬆️ Uppdatera!' :
                                         updateStatus === 'none' ? '✓ Aktuell' :
                                         updateStatus === 'error' ? '⚠️ Fel' :
                                         '🔄 Kontrollera'}
                                    </button>
                                </div>
                                <div
                                    className="text-xs text-gray-400 mt-1 cursor-pointer hover:text-gray-200"
                                    onClick={() => {
                                        const buildInfo = getBuildInfo();
                                        alert(`Build: ${buildInfo.fullVersion}\nBeskrivning: ${buildInfo.description}`);
                                    }}
                                    title="Klicka för mer info"
                                >
                                    {getBuildInfo().description}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HamburgerMenu;
