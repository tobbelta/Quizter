import React from 'react';

const Logo = ({ size = 80 }) => {
    return (
        <svg
            width={size}
            height={size}
            // FIX: Justerad viewBox för att ge plats åt skuggan
            viewBox="0 0 120 120"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <filter id="soft-shadow-logo" x="-50%" y="-50%" width="200%" height="200%">
                    {/* Justerade värden för en mjukare skugga */}
                    <feDropShadow dx="5" dy="5" stdDeviation="5" floodColor="#a3b1c6" />
                    <feDropShadow dx="-5" dy="-5" stdDeviation="5" floodColor="#ffffff" />
                </filter>
            </defs>
            {/* Centrera elementen i den nya viewBoxen */}
            <g transform="translate(10, 10)">
                <g filter="url(#soft-shadow-logo)">
                    <circle cx="50" cy="50" r="45" fill="#e0e5ec" />
                </g>
                <g>
                    <path d="M50 15 L55 50 L50 45 L45 50 Z" fill="#333" />
                    <path d="M50 85 L45 50 L50 55 L55 50 Z" fill="#4a90e2" />
                    <path d="M15 50 L50 55 L45 50 L50 45 Z" fill="#333" />
                    <path d="M85 50 L50 45 L55 50 L50 55 Z" fill="#4a90e2" />
                    <circle cx="50" cy="50" r="8" fill="#e0e5ec" stroke="#333" strokeWidth="2" />
                </g>
            </g>
        </svg>
    );
};

export default Logo;
