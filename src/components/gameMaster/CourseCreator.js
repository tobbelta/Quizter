// src/components/gameMaster/CourseCreator.js
import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'; // Tog bort oanvänd 'Circle'
import L from 'leaflet';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { startIcon, finishIcon, obstacleIcon } from '../shared/MapIcons';
import ObstacleSelectorModal from './ObstacleSelectorModal';

const CourseCreator = ({ courseToEdit, onCourseSaved }) => {
    const [courseName, setCourseName] = useState('');
    const [start, setStart] = useState(null);
    const [finish, setFinish] = useState(null);
    const [obstacles, setObstacles] = useState([]);
    const [mode, setMode] = useState('start'); // 'start', 'finish', 'obstacle'
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newObstaclePosition, setNewObstaclePosition] = useState(null);

    const kalmarPosition = [56.6634, 16.3571];
    const GAME_RADIUS = 100; // 100 meter

    useEffect(() => {
        if (courseToEdit) {
            setCourseName(courseToEdit.name || '');
            setStart(courseToEdit.start || null);
            setFinish(courseToEdit.finish || null);
            setObstacles(courseToEdit.obstacles || []);
        }
    }, [courseToEdit]);

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
            createdAt: new Date(),
            updatedAt: new Date()
        };

        try {
            if (courseToEdit) {
                const courseRef = doc(db, 'courses', courseToEdit.id);
                await updateDoc(courseRef, courseData);
                alert('Banan har uppdaterats!');
            } else {
                await addDoc(collection(db, 'courses'), courseData);
                alert('Banan har sparats!');
            }
            if (onCourseSaved) onCourseSaved();
            resetForm();
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

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-800">{courseToEdit ? 'Redigera Bana' : 'Skapa Ny Bana'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                    type="text"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="Namn på banan"
                    className="soft-ui-input"
                />
                <div className="flex gap-2">
                    <button onClick={() => setMode('start')} className={`soft-ui-button ${mode === 'start' ? 'soft-ui-button-primary' : ''} w-full`}>Sätt Start</button>
                    <button onClick={() => setMode('obstacle')} className={`soft-ui-button ${mode === 'obstacle' ? 'soft-ui-button-primary' : ''} w-full`} disabled={!start}>Sätt Hinder</button>
                    <button onClick={() => setMode('finish')} className={`soft-ui-button ${mode === 'finish' ? 'soft-ui-button-primary' : ''} w-full`} disabled={!start}>Sätt Mål</button>
                </div>
            </div>
            <div className="h-96 soft-ui-card p-0 overflow-hidden">
                <MapContainer center={start ? [start.lat, start.lng] : kalmarPosition} zoom={15} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <MapEvents />
                    {start && <Marker position={[start.lat, start.lng]} icon={startIcon} />}
                    {finish && <Marker position={[finish.lat, finish.lng]} icon={finishIcon} />}
                    {obstacles.map((obs, index) => (
                        <Marker key={index} position={[obs.position.lat, obs.position.lng]} icon={obstacleIcon} />
                    ))}
                    <MapController bounds={calculateBounds()} start={start} /> {/* FIX: Skicka med 'start' som en prop */}
                </MapContainer>
            </div>
            <button onClick={handleSaveCourse} className="soft-ui-button soft-ui-button-green w-full">
                {courseToEdit ? 'Uppdatera Bana' : 'Spara Bana'}
            </button>
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
