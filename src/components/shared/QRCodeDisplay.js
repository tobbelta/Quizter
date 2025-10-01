import React from 'react';

const QRCodeDisplay = ({ dataUrl, isLoading, error, description }) => {
  if (isLoading) {
    return <p className="text-sm text-gray-400">Genererar QR-kod...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-300">{error}</p>;
  }

  return (
    <div className="rounded-lg bg-slate-900/60 p-4">
      {description && <p className="text-sm text-gray-400 mb-3">{description}</p>}
      {dataUrl && (
        <img src={dataUrl} alt="QR-kod" className="w-full max-w-sm mx-auto rounded" />
      )}
    </div>
  );
};

export default QRCodeDisplay;