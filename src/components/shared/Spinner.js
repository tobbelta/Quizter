import React from 'react';

const Spinner = ({ size = 64 }) => {
  return (
    <div className="flex items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        className="animate-spin"
        style={{ animationDuration: '2s' }}
      >
        <defs>
          {/* Metallisk gradient för bakgrund */}
          <radialGradient id="spinnerMetalGradient" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#2a2f38" />
            <stop offset="40%" stopColor="#1a1f2c" />
            <stop offset="100%" stopColor="#0d1117" />
          </radialGradient>

          {/* Glowing red gradient */}
          <radialGradient id="spinnerGlowingRed" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff6b6b" />
            <stop offset="50%" stopColor="#f85149" />
            <stop offset="100%" stopColor="#da3633" />
          </radialGradient>

          {/* Glowing cyan gradient */}
          <radialGradient id="spinnerGlowingCyan" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4ecdc4" />
            <stop offset="50%" stopColor="#30b6c4" />
            <stop offset="100%" stopColor="#238289" />
          </radialGradient>

          {/* Shiny metallic gradient */}
          <linearGradient id="spinnerMetallicShine" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="30%" stopColor="#c9d1d9" stopOpacity="0.8" />
            <stop offset="70%" stopColor="#8b949e" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#30363d" stopOpacity="0.3" />
          </linearGradient>

          {/* Glow effects */}
          <filter id="spinnerGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* Red glow */}
          <filter id="spinnerRedGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feColorMatrix type="matrix" values="0 0 0 0 0.97  0 0 0 0 0.32  0 0 0 0 0.29  0 0 0 1 0"/>
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* Cyan glow */}
          <filter id="spinnerCyanGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feColorMatrix type="matrix" values="0 0 0 0 0.19  0 0 0 0 0.71  0 0 0 0 0.77  0 0 0 1 0"/>
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* 3D Shadow */}
          <filter id="spinnerDrop3d" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="3" dy="3" stdDeviation="2" floodColor="#000000" floodOpacity="0.8" />
            <feDropShadow dx="-1" dy="-1" stdDeviation="1" floodColor="#ffffff" floodOpacity="0.1" />
          </filter>
        </defs>

        {/* Outer glow ring */}
        <circle cx="50" cy="50" r="49" fill="none" stroke="url(#spinnerGlowingRed)" strokeWidth="1" opacity="0.3" filter="url(#spinnerGlow)" />

        {/* Main compass body */}
        <circle cx="50" cy="50" r="47" fill="url(#spinnerMetalGradient)" stroke="#30363d" strokeWidth="2" filter="url(#spinnerDrop3d)" />

        {/* Metallic shine overlay */}
        <circle cx="50" cy="50" r="45" fill="url(#spinnerMetallicShine)" opacity="0.3" />

        {/* Inner decorative rings */}
        <circle cx="50" cy="50" r="42" fill="none" stroke="#30b6c4" strokeWidth="1" opacity="0.6" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="#f85149" strokeWidth="0.5" opacity="0.4" />

        {/* Enhanced cardinal markings */}
        <g>
          {/* North marking */}
          <rect x="48" y="6" width="4" height="8" fill="url(#spinnerGlowingRed)" filter="url(#spinnerRedGlow)" />
          {/* East marking */}
          <rect x="86" y="48" width="8" height="4" fill="url(#spinnerGlowingCyan)" filter="url(#spinnerCyanGlow)" />
          {/* South marking */}
          <rect x="48" y="86" width="4" height="8" fill="url(#spinnerGlowingRed)" filter="url(#spinnerRedGlow)" />
          {/* West marking */}
          <rect x="6" y="48" width="8" height="4" fill="url(#spinnerGlowingCyan)" filter="url(#spinnerCyanGlow)" />
        </g>

        {/* Enhanced compass needles with glow */}
        <g filter="url(#spinnerRedGlow)">
          <path d="M50 10 L58 46 L50 43 L42 46 Z" fill="url(#spinnerGlowingRed)" stroke="#ff6b6b" strokeWidth="1" />
        </g>

        <g filter="url(#spinnerCyanGlow)">
          <path d="M50 90 L42 54 L50 57 L58 54 Z" fill="url(#spinnerGlowingCyan)" stroke="#4ecdc4" strokeWidth="1" />
        </g>

        <path d="M90 50 L54 42 L57 50 L54 58 Z" fill="url(#spinnerMetallicShine)" stroke="#c9d1d9" strokeWidth="1" filter="url(#spinnerGlow)" />
        <path d="M10 50 L46 58 L43 50 L46 42 Z" fill="url(#spinnerMetallicShine)" stroke="#c9d1d9" strokeWidth="1" filter="url(#spinnerGlow)" />

        {/* Center jewel with multiple layers */}
        <circle cx="50" cy="50" r="8" fill="url(#spinnerMetalGradient)" stroke="url(#spinnerGlowingRed)" strokeWidth="2" filter="url(#spinnerDrop3d)" />
        <circle cx="50" cy="50" r="6" fill="url(#spinnerGlowingRed)" opacity="0.8" />
        <circle cx="50" cy="50" r="4" fill="#ff6b6b" filter="url(#spinnerRedGlow)" />
        <circle cx="47" cy="47" r="1.5" fill="#ffffff" opacity="0.8" />

        {/* Pulsing glow effect for extra loading indication */}
        <circle cx="50" cy="50" r="50" fill="none" stroke="url(#spinnerGlowingRed)" strokeWidth="0.5" opacity="0.2">
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur="1.5s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
};

export default Spinner;
