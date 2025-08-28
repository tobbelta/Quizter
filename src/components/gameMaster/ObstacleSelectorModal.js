import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const ObstacleSelectorModal = ({ onSelect, onCancel }) => {
    const [obstacles, setObstacles] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'obstacles'), (snapshot) => {
            const obstaclesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setObstacles(obstaclesData);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[1001] p-4">
            <div className="neu-card w-full max-w-2xl">
                <h2 className="text-2xl font-bold mb-4 uppercase">Välj ett hinder från banken</h2>
                <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
                    {loading ? <p>Laddar...</p> : obstacles.map(obs => (
                        <button 
                            key={obs.id} 
                            onClick={() => onSelect(obs.id)}
                            className="w-full text-left p-3 bg-gray-800 hover:bg-gray-700 rounded-md border-2 border-gray-600"
                        >
                            <p className="font-semibold">{obs.question}</p>
                        </button>
                    ))}
                </div>
                <div className="flex justify-end mt-4">
                    <button onClick={onCancel} className="neu-button neu-button-secondary">
                        Avbryt
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ObstacleSelectorModal;
