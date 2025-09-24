import React, { useState } from 'react';

const PlayerCompass = ({ position, isVisible = true, onToggleVisibility }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!isVisible) return null;

    const formatCoordinate = (value, type = 'lat') => {
        if (typeof value !== 'number') return 'N/A';
        const direction = type === 'lat' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
        return `${Math.abs(value).toFixed(6)}°${direction}`;
    };

    const formatAccuracy = (accuracy) => {
        if (typeof accuracy !== 'number') return 'N/A';
        return accuracy < 1000 ? `${Math.round(accuracy)}m` : `${(accuracy / 1000).toFixed(1)}km`;
    };

    const getAccuracyColor = (accuracy) => {
        if (!accuracy || accuracy > 100) return 'text-red-400';
        if (accuracy > 20) return 'text-yellow-400';
        return 'text-green-400';
    };

    const getAccuracyDescription = (accuracy) => {
        if (!accuracy || accuracy > 100) return 'Låg noggrannhet';
        if (accuracy > 20) return 'Medium noggrannhet';
        return 'Hög noggrannhet';
    };

    return (
        <div className="fixed top-10 right-2 z-[1001] bg-black bg-opacity-80 rounded-lg shadow-lg border border-primary">
            {/* Minimal vy */}
            {!isExpanded && (
                <div
                    onClick={() => setIsExpanded(true)}
                    className="p-2 cursor-pointer hover:bg-gray-800 rounded-lg transition-colors"
                >
                    <div className="text-white text-xs font-mono flex items-center gap-2">
                        <span className="text-primary">📍</span>
                        <span>
                            {position ?
                                `${formatCoordinate(position.coords.latitude, 'lat').slice(0, 8)}...`
                                : 'Väntar...'
                            }
                        </span>
                    </div>
                </div>
            )}

            {/* Expanderad vy */}
            {isExpanded && (
                <div className="p-3 min-w-[200px]">
                    {/* Header med toggle-knappar */}
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1">
                            <span className="text-primary text-sm">📍</span>
                            <span className="text-white text-xs font-bold">Position</span>
                        </div>
                        <div className="flex gap-1">
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="text-gray-400 hover:text-white text-xs px-1"
                                title="Minimera"
                            >
                                −
                            </button>
                            <button
                                onClick={() => onToggleVisibility?.(false)}
                                className="text-gray-400 hover:text-white text-xs px-1"
                                title="Dölj"
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    {position ? (
                        <>
                            {/* Koordinater */}
                            <div className="space-y-1 mb-3">
                                <div className="text-white text-xs font-mono">
                                    <span className="text-gray-400">Lat:</span> {formatCoordinate(position.coords.latitude, 'lat')}
                                </div>
                                <div className="text-white text-xs font-mono">
                                    <span className="text-gray-400">Lng:</span> {formatCoordinate(position.coords.longitude, 'lng')}
                                </div>
                            </div>

                            {/* Noggrannhet */}
                            <div className="border-t border-gray-600 pt-2">
                                <div className={`text-xs font-mono ${getAccuracyColor(position.coords.accuracy)}`}>
                                    <div className="flex items-center justify-between">
                                        <span>Noggrannhet:</span>
                                        <span>{formatAccuracy(position.coords.accuracy)}</span>
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                        {getAccuracyDescription(position.coords.accuracy)}
                                    </div>
                                </div>

                                {/* Extra info om tillgänglig */}
                                {(position.coords.altitude !== null || position.coords.speed !== null) && (
                                    <div className="mt-2 pt-2 border-t border-gray-700 space-y-1">
                                        {position.coords.altitude !== null && (
                                            <div className="text-xs text-gray-300 font-mono">
                                                <span className="text-gray-400">Höjd:</span> {Math.round(position.coords.altitude)}m
                                            </div>
                                        )}
                                        {position.coords.speed !== null && position.coords.speed > 0 && (
                                            <div className="text-xs text-gray-300 font-mono">
                                                <span className="text-gray-400">Hastighet:</span> {Math.round(position.coords.speed * 3.6)} km/h
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="text-gray-400 text-xs">
                            Väntar på position...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PlayerCompass;