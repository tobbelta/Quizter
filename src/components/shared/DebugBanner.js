import React from 'react';
import { useDebug } from '../../context/DebugContext';

const DebugBanner = () => {
    // Hämtar den centrala debug-statusen
    const { isDebugMode } = useDebug();

    // Om vi inte är i debug-läge, visa ingenting
    if (!isDebugMode) {
        return null;
    }

    // Stilmall för bannern
    const bannerStyle = {
        position: 'fixed',
        bottom: '0',
        left: '0',
        width: '100%',
        backgroundColor: '#ffff00', // --accent-yellow
        color: '#1a1a1a', // --background
        textAlign: 'center',
        padding: '4px',
        fontSize: '14px',
        fontWeight: 'bold',
        zIndex: 9999,
        borderTop: '2px solid #f0f0f0'
    };

    return (
        <div style={bannerStyle}>
            DEBUG-LÄGE AKTIVT
        </div>
    );
};

export default DebugBanner;
