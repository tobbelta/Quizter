// src/components/gameMaster/CourseCreator.js
import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'; // Tog bort oanvänd 'Circle'
import { useParams, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { collection, addDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { startIcon, finishIcon, obstacleIcon } from '../shared/MapIcons';
import ObstacleSelectorModal from './ObstacleSelectorModal';
import Spinner from '../shared/Spinner';
import Header from '../shared/Header';

const CourseCreator = ({ courseToEdit, onCourseSaved, user, userData, courseId: propCourseId, onSave }) => {
    const { courseId: urlCourseId } = useParams();
    const courseId = propCourseId || urlCourseId;
    const navigate = useNavigate();

    const [courseName, setCourseName] = useState('');
    const [start, setStart] = useState(null);
    const [finish, setFinish] = useState(null);
    const [obstacles, setObstacles] = useState([]);
    const [mode, setMode] = useState('start'); // 'start', 'finish', 'obstacle'
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newObstaclePosition, setNewObstaclePosition] = useState(null);
    const [loading, setLoading] = useState(false);
    const [, setCurrentCourse] = useState(null);

    const kalmarPosition = [56.6634, 16.3571];
    const GAME_RADIUS = 100; // 100 meter
    const isEditMode = !!(courseToEdit || courseId);

    // Determine if we're in GameMaster context (no Header needed) or standalone context (Header needed)
    const isInGameMasterContext = !!(propCourseId || onSave);

    // Load course data from URL parameter or props
    useEffect(() => {
        const loadCourseData = async () => {
            if (courseId && !courseToEdit) {
                setLoading(true);
                try {
                    const courseRef = doc(db, 'courses', courseId);
                    const courseSnap = await getDoc(courseRef);

                    if (courseSnap.exists()) {
                        const courseData = { id: courseSnap.id, ...courseSnap.data() };
                        setCurrentCourse(courseData);
                        setCourseName(courseData.name || '');
                        setStart(courseData.start || null);
                        setFinish(courseData.finish || null);
                        setObstacles(courseData.obstacles || []);

                        // Set appropriate mode based on existing data
                        if (!courseData.start) {
                            setMode('start');
                        } else if (!courseData.finish) {
                            setMode('finish');
                        } else {
                            setMode('obstacle');
                        }
                    } else {
                        console.error('Course not found');
                        navigate('/gm/courses');
                    }
                } catch (error) {
                    console.error('Error loading course:', error);
                    navigate('/gm/courses');
                } finally {
                    setLoading(false);
                }
            } else if (courseToEdit) {
                setCurrentCourse(courseToEdit);
                setCourseName(courseToEdit.name || '');
                setStart(courseToEdit.start || null);
                setFinish(courseToEdit.finish || null);
                setObstacles(courseToEdit.obstacles || []);

                // Set appropriate mode based on existing data
                if (!courseToEdit.start) {
                    setMode('start');
                } else if (!courseToEdit.finish) {
                    setMode('finish');
                } else {
                    setMode('obstacle');
                }
            }
        };

        loadCourseData();
    }, [courseId, courseToEdit, navigate]);

    const handleAddObstacle = (obstacleId) => {
        setObstacles(prev => [...prev, { position: newObstaclePosition, obstacleId }]);
        setIsModalOpen(false);
        setNewObstaclePosition(null);
    };

    const MapEvents = () => {
        useMapEvents({
            click(e) {
                const { lat, lng } = e.latlng;
                
                if (mode === 'start') {
                    setStart({ lat, lng });
                    setMode('obstacle'); // Gå vidare till att placera hinder
                } else if (mode === 'finish') {
                    if (start && L.latLng(start).distanceTo(e.latlng) <= GAME_RADIUS) {
                        setFinish({ lat, lng });
                    } else {
                        alert(`Målet måste placeras inom ${GAME_RADIUS} meter från startpunkten.`);
                    }
                } else if (mode === 'obstacle') {
                    if (start && L.latLng(start).distanceTo(e.latlng) <= GAME_RADIUS) {
                        setNewObstaclePosition({ lat, lng });
                        setIsModalOpen(true);
                    } else {
                        alert(`Hinder måste placeras inom ${GAME_RADIUS} meter från startpunkten.`);
                    }
                }
            },
        });
        return null;
    };
    
    // FIX: Lade till 'finish' och 'obstacles' i dependency array.
    const calculateBounds = useCallback(() => {
        if (!start) return null;
        const points = [start];
        if (finish) points.push(finish);
        obstacles.forEach(o => points.push(o.position));
        if (points.length > 0) {
            return L.latLngBounds(points);
        }
        return L.latLng(start).toBounds(500); // Fallback om bara start finns
    }, [start, finish, obstacles]);

    const MapController = ({ bounds, start }) => { // FIX: Ta emot 'start' som en prop
        const map = useMapEvents({});
        useEffect(() => {
            if (bounds && bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50] });
            } else if (start) {
                map.setView(start, 16);
            }
        }, [map, bounds, start]); // FIX: Beroendet är nu korrekt eftersom 'start' är en prop
        return null;
    };

    const handleSaveCourse = async () => {
        if (!courseName || !start || !finish || obstacles.length === 0) {
            alert('En bana måste ha ett namn, en start, ett mål och minst ett hinder.');
            return;
        }

        const courseData = {
            name: courseName,
            start,
            finish,
            obstacles,
            creatorId: auth.currentUser.uid,
            updatedAt: new Date()
        };

        // Add createdAt only for new courses
        if (!isEditMode) {
            courseData.createdAt = new Date();
        }

        try {
            if (isEditMode) {
                // Update existing course (either from courseToEdit or courseId)
                const courseIdToUpdate = courseToEdit?.id || courseId;
                const courseRef = doc(db, 'courses', courseIdToUpdate);
                await updateDoc(courseRef, courseData);
                alert('Banan har uppdaterats!');

                // Handle navigation based on context
                if (onSave) {
                    onSave(); // GameMaster context via CourseManagement
                } else if (onCourseSaved) {
                    onCourseSaved(); // Props-based callback
                } else if (urlCourseId) {
                    navigate('/gm/courses'); // URL-based editing
                }
            } else {
                // Create new course
                await addDoc(collection(db, 'courses'), courseData);
                alert('Banan har sparats!');
                resetForm();
            }
        } catch (error) {
            console.error("Fel vid sparande av bana: ", error);
            alert('Kunde inte spara banan.');
        }
    };
    
    const resetForm = () => {
        setCourseName('');
        setStart(null);
        setFinish(null);
        setObstacles([]);
        setMode('start');
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Spinner />
            </div>
        );
    }

    return (
        <div className={isInGameMasterContext ? "" : "container mx-auto p-4 max-w-6xl"}>
            {!isInGameMasterContext && (
                <Header
                    title={isEditMode ? `Redigera Bana: ${courseName || 'Laddar...'}` : "Skapa Ny Bana"}
                    user={user || {}}
                    userData={userData || {}}
                >
                    <button
                        onClick={() => urlCourseId ? navigate('/gm/courses') : onCourseSaved?.()}
                        className="sc-button"
                    >
                        Tillbaka
                    </button>
                </Header>
            )}

            {isInGameMasterContext && isEditMode && (
                <h2 className="text-2xl font-bold mb-6 text-accent-cyan">
                    Redigera Bana: {courseName || 'Laddar...'}
                </h2>
            )}

            {isInGameMasterContext && !isEditMode && (
                <h2 className="text-2xl font-bold mb-6 text-accent-cyan">
                    Skapa Ny Bana
                </h2>
            )}

            <main>
                <div className="sc-card space-y-6">
                    <div>
                        <label className="block text-sm font-bold mb-2 text-accent-cyan uppercase">
                            Bannamn
                        </label>
                        <input
                            type="text"
                            value={courseName}
                            onChange={(e) => setCourseName(e.target.value)}
                            placeholder="Namn på banan"
                            className="sc-input"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold mb-2 text-accent-cyan uppercase">
                            Placeringsläge
                        </label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setMode('start')}
                                className={`sc-button w-full ${mode === 'start' ? 'sc-button-blue' : ''}`}
                            >
                                Sätt Start
                            </button>
                            <button
                                onClick={() => setMode('obstacle')}
                                disabled={!start}
                                className={`sc-button w-full ${mode === 'obstacle' ? 'sc-button-blue' : ''}`}
                            >
                                Sätt Hinder
                            </button>
                            <button
                                onClick={() => setMode('finish')}
                                disabled={!start}
                                className={`sc-button w-full ${mode === 'finish' ? 'sc-button-blue' : ''}`}
                            >
                                Sätt Mål
                            </button>
                        </div>
                    </div>

                    {/* Course Status */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className={`p-3 rounded-lg border ${start ? 'bg-green-900/20 border-green-600' : 'bg-gray-800 border-gray-600'}`}>
                            <div className="text-sm font-bold text-accent-cyan">Start</div>
                            <div className="text-text-secondary text-sm">
                                {start ? `${start.lat.toFixed(4)}, ${start.lng.toFixed(4)}` : 'Inte placerad'}
                            </div>
                        </div>
                        <div className={`p-3 rounded-lg border ${finish ? 'bg-green-900/20 border-green-600' : 'bg-gray-800 border-gray-600'}`}>
                            <div className="text-sm font-bold text-accent-cyan">Mål</div>
                            <div className="text-text-secondary text-sm">
                                {finish ? `${finish.lat.toFixed(4)}, ${finish.lng.toFixed(4)}` : 'Inte placerat'}
                            </div>
                        </div>
                        <div className={`p-3 rounded-lg border ${obstacles.length > 0 ? 'bg-green-900/20 border-green-600' : 'bg-gray-800 border-gray-600'}`}>
                            <div className="text-sm font-bold text-accent-cyan">Hinder</div>
                            <div className="text-text-secondary text-sm">
                                {obstacles.length} st placerade
                            </div>
                        </div>
                    </div>

                    <div className="h-96 bg-gray-800 rounded-lg overflow-hidden border border-border-color">
                        <MapContainer center={start ? [start.lat, start.lng] : kalmarPosition} zoom={15} style={{ height: '100%', width: '100%' }}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            <MapEvents />
                            {start && <Marker position={[start.lat, start.lng]} icon={startIcon} />}
                            {finish && <Marker position={[finish.lat, finish.lng]} icon={finishIcon} />}
                            {obstacles.map((obs, index) => (
                                <Marker key={index} position={[obs.position.lat, obs.position.lng]} icon={obstacleIcon} />
                            ))}
                            <MapController bounds={calculateBounds()} start={start} />
                        </MapContainer>
                    </div>

                    <button
                        onClick={handleSaveCourse}
                        disabled={!courseName || !start || !finish || obstacles.length === 0}
                        className="sc-button sc-button-green w-full text-lg py-3"
                    >
                        {isEditMode ? 'Uppdatera Bana' : 'Spara Bana'}
                    </button>
                </div>
            </main>

            {isModalOpen && (
                <ObstacleSelectorModal
                    onClose={() => setIsModalOpen(false)}
                    onSelect={handleAddObstacle}
                />
            )}
        </div>
    );
};

export default CourseCreator;
