/**
 * GPS-status komponent som visar GPS-status tidigt i appen
 * - Snurrande logotyp när GPS söks
 * - GPS-noggrannhet när aktiv
 * - Tydlig men diskret
 */
import React from 'react';
import useRunLocation from '../../hooks/useRunLocation';

const GPSStatus = ({ className = '', showWhenDisabled = true }) => {
  const { status, coords, trackingEnabled } = useRunLocation();

  const getStatusInfo = () => {
    // Om GPS är avstängt
    if (!trackingEnabled) {
      return {
        icon: '/logo-compass.svg',
        text: 'GPS avstängd',
        color: 'text-gray-400',
        bgColor: 'bg-gray-900/20',
        borderColor: 'border-gray-500/30',
        spin: false
      };
    }

    switch (status) {
      case 'idle':
        // Visar när GPS precis startar (innan pending)
        return {
          icon: '/logo-compass.svg',
          text: 'Startar GPS...',
          color: 'text-gray-400',
          bgColor: 'bg-gray-900/20',
          borderColor: 'border-gray-500/30',
          spin: true
        };
      case 'pending':
        return {
          icon: '/logo-compass.svg',
          text: 'Söker GPS...',
          color: 'text-amber-400',
          bgColor: 'bg-amber-900/20',
          borderColor: 'border-amber-500/30',
          spin: true
        };
      case 'active':
        const accuracy = coords?.accuracy ? Math.round(coords.accuracy) : null;
        return {
          icon: '/logo-compass.svg',
          text: accuracy ? `±${accuracy}m` : 'GPS aktiv',
          color: accuracy && accuracy < 20 ? 'text-emerald-400' : accuracy && accuracy < 50 ? 'text-cyan-400' : 'text-amber-400',
          bgColor: accuracy && accuracy < 20 ? 'bg-emerald-900/20' : accuracy && accuracy < 50 ? 'bg-cyan-900/20' : 'bg-amber-900/20',
          borderColor: accuracy && accuracy < 20 ? 'border-emerald-500/30' : accuracy && accuracy < 50 ? 'border-cyan-500/30' : 'border-amber-500/30',
          spin: false
        };
      case 'denied':
        return {
          icon: '/logo-compass.svg',
          text: 'GPS nekad',
          color: 'text-red-400',
          bgColor: 'bg-red-900/20',
          borderColor: 'border-red-500/30',
          spin: false
        };
      case 'unsupported':
        return {
          icon: '/logo-compass.svg',
          text: 'GPS stöds ej',
          color: 'text-gray-400',
          bgColor: 'bg-gray-900/20',
          borderColor: 'border-gray-500/30',
          spin: false
        };
      case 'unavailable':
      case 'timeout':
      case 'error':
        return {
          icon: '/logo-compass.svg',
          text: 'GPS ej tillgänglig',
          color: 'text-amber-400',
          bgColor: 'bg-amber-900/20',
          borderColor: 'border-amber-500/30',
          spin: false
        };
      default:
        // Fallback om status är okänd
        return {
          icon: '/logo-compass.svg',
          text: 'Initierar...',
          color: 'text-gray-400',
          bgColor: 'bg-gray-900/20',
          borderColor: 'border-gray-500/30',
          spin: true
        };
    }
  };

  const statusInfo = getStatusInfo();
  if (!statusInfo) return null;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${statusInfo.bgColor} ${statusInfo.borderColor} ${className}`}>
      <img
        src={statusInfo.icon}
        alt="GPS"
        className={`w-5 h-5 ${statusInfo.spin ? 'animate-spin' : ''}`}
        style={statusInfo.spin ? { animationDuration: '2s' } : {}}
      />
      <span className={`text-sm font-medium ${statusInfo.color}`}>
        {statusInfo.text}
      </span>
    </div>
  );
};

export default GPSStatus;
