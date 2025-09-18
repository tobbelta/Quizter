import React from "react";

const JsonDisplayModal = ({ open, onClose, data }) => {
  if (!open) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-lg max-w-4xl w-full max-h-[80vh] flex flex-col border border-gray-700">
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Speldata (JSON)</h2>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="bg-gray-900 text-gray-300 p-4 rounded overflow-auto text-sm">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-700">
          <button
            onClick={handleCopy}
            className="sc-button sc-button-blue"
          >
            Kopiera
          </button>
          <button
            onClick={onClose}
            className="sc-button sc-button-red"
          >
            Stäng
          </button>
        </div>
      </div>
    </div>
  );
};

export default JsonDisplayModal;
