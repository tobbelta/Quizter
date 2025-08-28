import React, { useState } from 'react';

const JsonDisplayModal = ({ jsonData, onClose }) => {
    const [copySuccess, setCopySuccess] = useState('');

    const copyToClipboard = () => {
        const jsonString = JSON.stringify(jsonData, null, 2);
        navigator.clipboard.writeText(jsonString).then(() => {
            setCopySuccess('Kopierad!');
            setTimeout(() => setCopySuccess(''), 2000);
        }, (err) => {
            setCopySuccess('Kunde inte kopiera');
            console.error('Could not copy text: ', err);
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[1002]">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-4xl w-full flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">Speldata (JSON)</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
                </div>
                <div className="bg-gray-800 text-green-400 font-mono p-4 rounded-md overflow-auto flex-grow" style={{ maxHeight: '70vh' }}>
                    <pre><code>{JSON.stringify(jsonData, null, 2)}</code></pre>
                </div>
                <div className="flex justify-end mt-4">
                    <button 
                        onClick={copyToClipboard} 
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                    >
                        {copySuccess || 'Kopiera till urklipp'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default JsonDisplayModal;
