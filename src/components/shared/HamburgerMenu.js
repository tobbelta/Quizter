import React, { useState, useRef, useEffect } from 'react';
import { getVersionString, getBuildInfo, checkForUpdates } from '../../version';

const HamburgerMenu = ({ children, teamMembers }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [updateStatus, setUpdateStatus] = useState(null); // null, 'checking', 'available', 'none', 'error'
    const [showPlayers, setShowPlayers] = useState(false);
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
            <button onClick={() => setIsOpen(!isOpen)} className="p-1 text-white hover:text-cyan-300 transition-colors duration-200 relative z-[1001]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path>
                </svg>
            </button>

            {isOpen && (
                <div
                    className="absolute top-full right-0 mt-1 w-48 z-[1001] transition-all duration-300 ease-in-out p-2"
                    style={{
                        transformOrigin: 'top right',
                        backgroundColor: 'rgba(22, 27, 34, 0.95)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(48, 182, 196, 0.3)',
                        borderRadius: '8px'
                    }}
                >
                    <div className="flex flex-col gap-1">
                        {children}

                        {/* Spelare knapp */}
                        {teamMembers && (
                            <button
                                onClick={() => setShowPlayers(!showPlayers)}
                                className="flex items-center gap-1 px-2 py-1 text-xs text-cyan-100 hover:text-cyan-300 hover:bg-cyan-500/20 rounded transition-all duration-200 justify-center bg-cyan-500/10 w-full"
                            >
                                <span className="text-xs">👥</span>
                                <span>Spelare ({teamMembers?.filter(m => m.isActive).length || 0}/{teamMembers?.length || 0})</span>
                            </button>
                        )}

                        {/* Spelare lista */}
                        {showPlayers && teamMembers && (
                            <div className="border-t border-cyan-500/20 pt-1 mt-1">
                                <div className="text-xs text-gray-300 mb-1">Lagmedlemmar:</div>
                                {teamMembers.length > 0 ? (
                                    <div className="space-y-1">
                                        {teamMembers.map((member, index) => (
                                            <div key={member.uid || index} className="flex justify-between items-center text-xs">
                                                <span className="text-white truncate mr-2 flex items-center">
                                                    {/* Visibility indikator */}
                                                    {member.isActive && (
                                                        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                                                            member.isVisible ? 'bg-green-400' : 'bg-yellow-400'
                                                        }`}
                                                        title={member.isVisible ? 'Spelet är synligt' : 'Spelet är minimerat/dolt'}
                                                        />
                                                    )}
                                                    {member.displayName || member.email || `Spelare ${index + 1}`}
                                                </span>
                                                <span className={`px-1 py-0.5 rounded text-xs font-bold ${
                                                    member.isActive ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                                                }`}>
                                                    {member.isActive ? 'AKTIV' : 'INAKTIV'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-xs text-gray-500">Inga lagmedlemmar hittades</div>
                                )}
                            </div>
                        )}

                        {/* Versionsinformation */}
                        <div className="border-t border-cyan-500/20 pt-1 mt-1">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-medium text-cyan-300">{getVersionString()}</span>
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
                                    className={`text-xs px-2 py-1 rounded transition-all duration-200 font-medium ${
                                        updateStatus === 'checking' ? 'bg-yellow-600/80 text-yellow-100' :
                                        updateStatus === 'available' ? 'bg-green-600/80 text-green-100 animate-pulse' :
                                        updateStatus === 'none' ? 'bg-gray-600/80 text-gray-100' :
                                        updateStatus === 'error' ? 'bg-red-600/80 text-red-100' :
                                        'bg-cyan-600/80 text-cyan-100 hover:bg-cyan-500/80'
                                    }`}
                                    title="Kontrollera om ny version finns"
                                >
                                    {updateStatus === 'checking' ? '🔄' :
                                     updateStatus === 'available' ? '⬆️' :
                                     updateStatus === 'none' ? '✓' :
                                     updateStatus === 'error' ? '⚠️' :
                                     '🔄'}
                                </button>
                            </div>
                            <div
                                className="text-xs text-gray-400 p-1 bg-gray-800/30 rounded cursor-pointer hover:text-cyan-300 hover:bg-gray-800/50 transition-all duration-200"
                                onClick={() => {
                                    const buildInfo = getBuildInfo();
                                    alert(`Build: ${buildInfo.fullVersion}\nBeskrivning: ${buildInfo.description}`);
                                }}
                                title="Klicka för detaljerad build-info"
                            >
                                {getBuildInfo().description}
                            </div>
                        </div>

                        {/* Stäng spelet knapp */}
                        <div className="border-t border-red-500/20 pt-1">
                            <button
                                onClick={() => window.location.href = '/teams'}
                                className="flex items-center gap-1 px-2 py-1 text-xs text-red-100 hover:text-red-300 hover:bg-red-500/20 rounded transition-all duration-200 justify-center bg-red-500/10 w-full"
                            >
                                <span className="text-xs">✖</span>
                                <span>Stäng spelet</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HamburgerMenu;
