import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import RiddleEditorModal from './RiddleEditorModal';
import Spinner from '../shared/Spinner';

const ObstacleBank = () => {
    const [obstacles, setObstacles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'obstacles'), (snapshot) => {
            setObstacles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleSaveRiddle = async (riddleData) => {
        try {
            await addDoc(collection(db, 'obstacles'), {
                type: 'riddle',
                ...riddleData,
                createdAt: new Date(),
            });
            setIsEditorOpen(false);
        } catch (error) {
            console.error("Error adding obstacle: ", error);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Är du säker på att du vill radera detta hinder från banken?")) {
            await deleteDoc(doc(db, 'obstacles', id));
        }
    };

    return (
        <div>
            {isEditorOpen && <RiddleEditorModal onSave={handleSaveRiddle} onCancel={() => setIsEditorOpen(false)} />}
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-accent-cyan">Hinderbank</h2>
                <button onClick={() => setIsEditorOpen(true)} className="sc-button sc-button-blue">
                    + Skapa Nytt Hinder
                </button>
            </div>
            {loading ? <Spinner /> : (
                <div className="space-y-4">
                    {obstacles.map(obstacle => (
                        <div key={obstacle.id} className="sc-card flex justify-between items-start">
                            <div>
                                <p className="font-semibold text-white">{obstacle.question}</p>
                                <ul className="text-sm text-text-secondary list-disc list-inside mt-1">
                                    {obstacle.options.map((opt, i) => (
                                        <li key={i} className={i === obstacle.correctAnswer ? 'font-bold text-green-400' : ''}>{opt}</li>
                                    ))}
                                </ul>
                            </div>
                            <button onClick={() => handleDelete(obstacle.id)} className="sc-button sc-button-red">
                                Radera
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ObstacleBank;
