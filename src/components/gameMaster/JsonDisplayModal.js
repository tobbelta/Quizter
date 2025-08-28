import React from "react";

const JsonDisplayModal = ({ open, onClose, data }) => {
  if (!open) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-6">
        <h2 className="text-xl font-bold mb-4">Speldata (JSON)</h2>
        <pre className="bg-gray-100 p-3 rounded overflow-x-auto max-h-96 text-xs mb-4">
          {JSON.stringify(data, null, 2)}
        </pre>
        <div className="flex justify-end gap-2">
          <button
            onClick={handleCopy}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Kopiera
          </button>
          <button
            onClick={onClose}
            className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
          >
            Stäng
          </button>
        </div>
      </div>
    </div>
  );
};

export default JsonDisplayModal;
