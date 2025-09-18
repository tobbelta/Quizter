import React, { useState, useEffect } from 'react';

const UserEditModal = ({ user, onSave, onCancel }) => {
    const [displayName, setDisplayName] = useState('');
    const [role, setRole] = useState('player');
    const [error, setError] = useState('');

    useEffect(() => {
        if (user) {
            setDisplayName(user.displayName || '');
            setRole(user.role || 'player');
        }
    }, [user]);

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        if (!displayName.trim()) {
            setError('Visningsnamn måste fyllas i.');
            return;
        }
        onSave({ displayName: displayName.trim(), role });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[1001] p-4">
            <div className="sc-card w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4 text-accent-cyan">Redigera Användare</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold mb-2 text-white">Visningsnamn:</label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:border-accent-cyan"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-2 text-white">Roll:</label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:border-accent-cyan"
                        >
                            <option value="player">Player</option>
                            <option value="gamemaster">Game Master</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-2 text-gray-400">Email (kan ej ändras):</label>
                        <input
                            type="email"
                            value={user?.email || ''}
                            disabled
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-400 cursor-not-allowed"
                        />
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

export default UserEditModal;