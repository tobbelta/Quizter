import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import CourseCreator from './CourseCreator';
import Spinner from '../shared/Spinner';
import ConfirmModal from '../shared/ConfirmModal';

const CourseManagement = () => {
    const [courses, setCourses] = useState([]);
    const [usersMap, setUsersMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [editingCourseId, setEditingCourseId] = useState(null);
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [selectedCourses, setSelectedCourses] = useState(new Set());
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, message: '' });

    useEffect(() => {
        // FIX: Robust felhantering och säkerställer att setLoading alltid anropas.
        try {
            const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
                const uMap = {};
                snapshot.forEach(doc => { uMap[doc.id] = doc.data(); });
                setUsersMap(uMap);
            });

            const unsubCourses = onSnapshot(collection(db, 'courses'), (snapshot) => {
                setCourses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setLoading(false);
            });

            return () => {
                unsubUsers();
                unsubCourses();
            };
        } catch (error) {
            console.error("Error setting up listeners:", error);
            setLoading(false);
        }
    }, []);

    const handleDelete = (id) => {
        setConfirmModal({
            isOpen: true,
            message: 'Är du säker på att du vill radera denna bana permanent? Denna åtgärd kan inte ångras.',
            onConfirm: () => confirmDelete(id),
        });
    };

    const confirmDelete = async (id) => {
        try {
            await deleteDoc(doc(db, 'courses', id));
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        } catch (error) {
            console.error("Error deleting course:", error);
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        }
    };

    const handleToggleCourse = (courseId) => {
        const newSelected = new Set(selectedCourses);
        if (newSelected.has(courseId)) {
            newSelected.delete(courseId);
        } else {
            newSelected.add(courseId);
        }
        setSelectedCourses(newSelected);
    };

    const handleSelectAll = () => {
        const courseIds = courses.map(course => course.id);
        const allSelected = courseIds.every(id => selectedCourses.has(id));

        const newSelected = new Set();
        if (!allSelected) {
            courseIds.forEach(id => newSelected.add(id));
        }
        setSelectedCourses(newSelected);
    };

    const handleBulkDelete = () => {
        if (selectedCourses.size === 0) return;

        setConfirmModal({
            isOpen: true,
            message: `Är du säker på att du vill radera ${selectedCourses.size} banor permanent? Denna åtgärd kan inte ångras.`,
            onConfirm: confirmBulkDelete,
        });
    };

    const confirmBulkDelete = async () => {
        try {
            const deletePromises = Array.from(selectedCourses).map(courseId =>
                deleteDoc(doc(db, 'courses', courseId))
            );
            await Promise.all(deletePromises);
            setSelectedCourses(new Set());
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        } catch (error) {
            console.error("Error bulk deleting courses:", error);
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        }
    };
    
    if (editingCourseId) {
        return (
            <div>
                <button onClick={() => setEditingCourseId(null)} className="sc-button mb-4">
                    &larr; Tillbaka till listan
                </button>
                <CourseCreator courseId={editingCourseId} onSave={() => setEditingCourseId(null)} />
            </div>
        );
    }

    if (isCreatingNew) {
        return (
            <div>
                <button onClick={() => setIsCreatingNew(false)} className="sc-button mb-4">
                    &larr; Tillbaka till listan
                </button>
                <CourseCreator onSave={() => setIsCreatingNew(false)} />
            </div>
        );
    }

    const hasSelectedCourses = selectedCourses.size > 0;
    const allSelected = courses.length > 0 && courses.every(course => selectedCourses.has(course.id));

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-accent-cyan">Banor</h2>
                <div className="flex items-center gap-3">
                    {hasSelectedCourses ? (
                        <>
                            <span className="text-gray-400">{selectedCourses.size} banor valda</span>
                            <button
                                onClick={handleBulkDelete}
                                className="sc-button sc-button-red"
                            >
                                Radera valda
                            </button>
                            <button
                                onClick={() => setSelectedCourses(new Set())}
                                className="sc-button"
                            >
                                Avmarkera alla
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setIsCreatingNew(true)}
                            className="sc-button sc-button-blue"
                        >
                            Skapa Ny Bana
                        </button>
                    )}
                </div>
            </div>

            {courses.length > 0 && (
                <div className="flex items-center gap-3 mb-4">
                    <label className="flex items-center gap-2 text-sm text-gray-400">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={handleSelectAll}
                            className="rounded border-gray-600 bg-gray-800 text-accent-cyan focus:ring-accent-cyan"
                        />
                        Välj alla ({courses.length})
                    </label>
                </div>
            )}

            {loading ? <Spinner /> : (
                <div className="space-y-4">
                    {courses.map(course => (
                        <div key={course.id} className="sc-card flex items-center p-3 gap-3">
                            <input
                                type="checkbox"
                                checked={selectedCourses.has(course.id)}
                                onChange={() => handleToggleCourse(course.id)}
                                className="rounded border-gray-600 bg-gray-800 text-accent-cyan focus:ring-accent-cyan flex-shrink-0"
                            />
                            <div className="flex-grow">
                                <p className="font-bold text-lg text-white">{course.name}</p>
                                <p className="text-sm text-text-secondary">
                                    Skapad av: {usersMap[course.creatorId]?.displayName || 'Okänd'}
                                </p>
                                <p className="text-sm text-text-secondary">Skapat: {course.createdAt ? new Date(course.createdAt.seconds * 1000).toLocaleString('sv-SE') : 'Okänt datum'}</p>
                                <p className="text-sm text-text-secondary">Antal hinder: {course.obstacles?.length || 0}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setEditingCourseId(course.id)} className="sc-button">
                                    Editera
                                </button>
                                <button onClick={() => handleDelete(course.id)} className="sc-button sc-button-red">
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

export default CourseManagement;
