import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import RiddleEditorModal from './RiddleEditorModal';
import Spinner from '../shared/Spinner';
import ConfirmModal from '../shared/ConfirmModal';

const ObstacleBank = () => {
    const [obstacles, setObstacles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingObstacle, setEditingObstacle] = useState(null);
    const [selectedObstacles, setSelectedObstacles] = useState(new Set());
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, message: '' });

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'obstacles'), (snapshot) => {
            setObstacles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleSaveRiddle = async (riddleData) => {
        try {
            if (editingObstacle) {
                await updateDoc(doc(db, 'obstacles', editingObstacle.id), riddleData);
            } else {
                await addDoc(collection(db, 'obstacles'), {
                    type: 'riddle',
                    ...riddleData,
                    createdAt: new Date(),
                });
            }
            setIsEditorOpen(false);
            setEditingObstacle(null);
        } catch (error) {
            console.error("Error saving obstacle: ", error);
        }
    };

    const handleEdit = (obstacle) => {
        setEditingObstacle(obstacle);
        setIsEditorOpen(true);
    };

    const handleDelete = (id) => {
        setConfirmModal({
            isOpen: true,
            message: 'Är du säker på att du vill radera detta hinder permanent? Denna åtgärd kan inte ångras.',
            onConfirm: () => confirmDelete(id),
        });
    };

    const confirmDelete = async (id) => {
        try {
            await deleteDoc(doc(db, 'obstacles', id));
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        } catch (error) {
            console.error("Error deleting obstacle:", error);
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        }
    };

    const handleToggleObstacle = (obstacleId) => {
        const newSelected = new Set(selectedObstacles);
        if (newSelected.has(obstacleId)) {
            newSelected.delete(obstacleId);
        } else {
            newSelected.add(obstacleId);
        }
        setSelectedObstacles(newSelected);
    };

    const handleSelectAll = () => {
        const obstacleIds = obstacles.map(obstacle => obstacle.id);
        const allSelected = obstacleIds.every(id => selectedObstacles.has(id));

        const newSelected = new Set();
        if (!allSelected) {
            obstacleIds.forEach(id => newSelected.add(id));
        }
        setSelectedObstacles(newSelected);
    };

    const handleBulkDelete = () => {
        if (selectedObstacles.size === 0) return;

        setConfirmModal({
            isOpen: true,
            message: `Är du säker på att du vill radera ${selectedObstacles.size} hinder permanent? Denna åtgärd kan inte ångras.`,
            onConfirm: confirmBulkDelete,
        });
    };

    const confirmBulkDelete = async () => {
        try {
            const deletePromises = Array.from(selectedObstacles).map(obstacleId =>
                deleteDoc(doc(db, 'obstacles', obstacleId))
            );
            await Promise.all(deletePromises);
            setSelectedObstacles(new Set());
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        } catch (error) {
            console.error("Error bulk deleting obstacles:", error);
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        }
    };

    const hasSelectedObstacles = selectedObstacles.size > 0;
    const allSelected = obstacles.length > 0 && obstacles.every(obstacle => selectedObstacles.has(obstacle.id));

    return (
        <div>
            {isEditorOpen && <RiddleEditorModal obstacle={editingObstacle} onSave={handleSaveRiddle} onCancel={() => { setIsEditorOpen(false); setEditingObstacle(null); }} />}

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-accent-cyan">Hinder</h2>
                <div className="flex items-center gap-3">
                    {hasSelectedObstacles ? (
                        <>
                            <span className="text-gray-400">{selectedObstacles.size} hinder valda</span>
                            <button
                                onClick={handleBulkDelete}
                                className="sc-button sc-button-red"
                            >
                                Radera valda
                            </button>
                            <button
                                onClick={() => setSelectedObstacles(new Set())}
                                className="sc-button"
                            >
                                Avmarkera alla
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setIsEditorOpen(true)} className="sc-button sc-button-blue">
                            + Skapa Nytt Hinder
                        </button>
                    )}
                </div>
            </div>

            {obstacles.length > 0 && (
                <div className="flex items-center gap-3 mb-4">
                    <label className="flex items-center gap-2 text-sm text-gray-400">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={handleSelectAll}
                            className="rounded border-gray-600 bg-gray-800 text-accent-cyan focus:ring-accent-cyan"
                        />
                        Välj alla ({obstacles.length})
                    </label>
                </div>
            )}

            {loading ? <Spinner /> : (
                <div className="space-y-4">
                    {obstacles.map(obstacle => (
                        <div key={obstacle.id} className="sc-card flex items-center p-3 gap-3">
                            <input
                                type="checkbox"
                                checked={selectedObstacles.has(obstacle.id)}
                                onChange={() => handleToggleObstacle(obstacle.id)}
                                className="rounded border-gray-600 bg-gray-800 text-accent-cyan focus:ring-accent-cyan flex-shrink-0"
                            />
                            <div className="flex-grow">
                                <p className="font-semibold text-white">{obstacle.question}</p>
                                <p className="text-sm text-text-secondary">Skapat: {obstacle.createdAt ? new Date(obstacle.createdAt.seconds * 1000).toLocaleString('sv-SE') : 'Okänt datum'}</p>
                                <ul className="text-sm text-text-secondary list-disc list-inside mt-1">
                                    {obstacle.options.map((opt, i) => (
                                        <li key={i} className={i === obstacle.correctAnswer ? 'font-bold text-green-400' : ''}>{opt}</li>
                                    ))}
                                </ul>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleEdit(obstacle)} className="sc-button">
                                    Editera
                                </button>
                                <button onClick={() => handleDelete(obstacle.id)} className="sc-button sc-button-red">
                                    Radera
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {confirmModal.isOpen && (
                <ConfirmModal
                    message={confirmModal.message}
                    onConfirm={confirmModal.onConfirm}
                    onClose={() => setConfirmModal({isOpen: false, onConfirm: null, message: ''})}
                />
            )}
        </div>
    );
};

export default ObstacleBank;
