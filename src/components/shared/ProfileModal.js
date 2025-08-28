import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const ProfileModal = ({ user, userData, onClose }) => {
    const [displayName, setDisplayName] = useState(userData?.displayName || '');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSave = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!displayName.trim()) {
            setError('Visningsnamn får inte vara tomt.');
            return;
        }

        const userDocRef = doc(db, 'users', user.uid);
        try {
            await updateDoc(userDocRef, { displayName });
            setSuccess('Ditt namn har uppdaterats!');
            setTimeout(() => onClose(), 1500);
        } catch (err) {
            setError('Kunde inte uppdatera profilen. Försök igen.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[1002] p-4">
            <div className="sc-card w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4 uppercase text-accent-cyan">Redigera Profil</h2>
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold mb-2 uppercase text-gray-400">Email:</label>
                        <p className="text-gray-300 mt-1">{user.email}</p>
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-2 uppercase text-gray-400">Visningsnamn:</label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="sc-input"
                            required
                        />
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                    {success && <p className="text-sm text-lime-400">{success}</p>}
                    <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="sc-button">
                            Stäng
                        </button>
                        <button type="submit" className="sc-button sc-button-blue">
                            Spara
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ProfileModal;
