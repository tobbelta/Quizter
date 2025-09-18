import React, { useState, useEffect } from 'react';

const TeamEditModal = ({ team, onSave, onCancel }) => {
    const [name, setName] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (team) {
            setName(team.name || '');
        }
    }, [team]);

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        if (!name.trim()) {
            setError('Lagnamn måste fyllas i.');
            return;
        }
        onSave({ name: name.trim() });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[1001] p-4">
            <div className="sc-card w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4 text-accent-cyan">Redigera Lag</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold mb-2 text-white">Lagnamn:</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:border-accent-cyan"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-2 text-gray-400">Lagledare (kan ej ändras):</label>
                        <input
                            type="text"
                            value={team?.leaderName || 'Okänd'}
                            disabled
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-400 cursor-not-allowed"
                        />
                        <p className="text-xs text-gray-500 mt-1">För att ändra lagledare, måste det göras från spelarens sida.</p>
                    </div>
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onCancel} className="sc-button">
                            Avbryt
                        </button>
                        <button type="submit" className="sc-button sc-button-blue">
                            Spara Ändringar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TeamEditModal;