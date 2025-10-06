import React from 'react';
import RunMap from '../run/RunMap';

const FullscreenMap = ({ checkpoints, route, userPosition, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50" onClick={onClose}>
      <div className="relative w-full h-full p-4">
        <RunMap checkpoints={checkpoints} route={route} userPosition={userPosition} activeOrder={0} answeredCount={0} />
        <button
          onClick={onClose}
          className="absolute top-8 right-8 bg-white rounded-full p-2 text-black font-bold text-xl"
        >
          &times;
        </button>
      </div>
    </div>
  );
};

export default FullscreenMap;
