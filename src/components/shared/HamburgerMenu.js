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
            <button onClick={() => setIsOpen(!isOpen)} className="sc-button p-3 relative z-[1001]">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path>
                </svg>
            </button>

            {isOpen && (
                <div
                    className="absolute top-full right-0 mt-2 w-56 sc-card z-[1001] transition-all duration-300 ease-in-out"
                    style={{
                        transformOrigin: 'top right',
                        backgroundColor: 'rgba(22, 27, 34, 0.95)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(48, 182, 196, 0.3)'
                    }}
                >
                    <div className="flex flex-col gap-3">
                        {children}

                        {/* Versionsinformation */}
                        <div className="border-t border-cyan-500/20 pt-3 mt-2">
                            <div className="px-1">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-medium text-cyan-300">Version {getVersionString()}</span>
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
                                        className={`text-xs px-3 py-1 rounded-md transition-all duration-200 font-medium ${
                                            updateStatus === 'checking' ? 'bg-yellow-600/80 text-yellow-100' :
                                            updateStatus === 'available' ? 'bg-green-600/80 text-green-100 animate-pulse' :
                                            updateStatus === 'none' ? 'bg-gray-600/80 text-gray-100' :
                                            updateStatus === 'error' ? 'bg-red-600/80 text-red-100' :
                                            'bg-cyan-600/80 text-cyan-100 hover:bg-cyan-500/80'
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
                                    className="text-xs text-gray-400 mt-2 p-2 bg-gray-800/30 rounded cursor-pointer hover:text-cyan-300 hover:bg-gray-800/50 transition-all duration-200"
                                    onClick={() => {
                                        const buildInfo = getBuildInfo();
                                        alert(`Build: ${buildInfo.fullVersion}\nBeskrivning: ${buildInfo.description}`);
                                    }}
                                    title="Klicka för detaljerad build-info"
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
