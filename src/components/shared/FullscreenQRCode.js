import React from 'react';

const FullscreenQRCode = ({ dataUrl, onClose }) => {
  if (!dataUrl) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50" onClick={onClose}>
      <div className="relative">
        <img src={dataUrl} alt="QR-kod" className="max-w-full max-h-full p-4 bg-white rounded-lg" />
        <button
          onClick={onClose}
          className="absolute top-2 right-2 bg-white rounded-full p-2 text-black font-bold text-xl"
        >
          &times;
        </button>
      </div>
    </div>
  );
};

export default FullscreenQRCode;
