import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import CourseCreator from './CourseCreator';
import Spinner from '../shared/Spinner';

const CourseManagement = () => {
    const [courses, setCourses] = useState([]);
    const [usersMap, setUsersMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [editingCourseId, setEditingCourseId] = useState(null);

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

    const handleDelete = async (id) => {
        if (window.confirm("Är du säker på att du vill radera denna bana?")) {
            await deleteDoc(doc(db, 'courses', id));
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

    return (
        <div>
            <h2 className="text-2xl font-bold mb-4 text-accent-cyan">Hantera Banor</h2>
            {loading ? <Spinner /> : (
                <div className="space-y-4">
                    {courses.map(course => (
                        <div key={course.id} className="sc-card flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div className="flex-grow">
                                <p className="font-bold text-lg text-white">{course.name}</p>
                                <p className="text-sm text-text-secondary">
                                    Skapad av: {usersMap[course.creatorId]?.displayName || 'Okänd'}
                                </p>
                                <p className="text-sm text-text-secondary">Antal hinder: {course.obstacles?.length || 0}</p>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <button onClick={() => setEditingCourseId(course.id)} className="sc-button w-full sm:w-auto">
                                    Editera
                                </button>
                                <button onClick={() => handleDelete(course.id)} className="sc-button sc-button-red w-full sm:w-auto">
                                    Radera
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CourseManagement;
