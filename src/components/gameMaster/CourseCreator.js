import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Circle, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { collection, addDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import ObstacleSelectorModal from './ObstacleSelectorModal';
import { startIcon, finishIcon, obstacleIcon } from '../shared/MapIcons';

const MapClickHandler = ({ onMapClick }) => {
    useMapEvents({
        click(e) { onMapClick(e.latlng); },
    });
    return null;
};

const MapZoomController = ({ bounds }) => {
    const map = useMap();
    useEffect(() => {
        if (bounds) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [bounds, map]);
    return null;
};

const CourseCreator = ({ courseId, onSave }) => {
    const [courseName, setCourseName] = useState('');
    const [start, setStart] = useState(null);
    const [finish, setFinish] = useState(null);
    const [obstacles, setObstacles] = useState([]);
    const [placementMode, setPlacementMode] = useState('start');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [info, setInfo] = useState('');
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [newObstacleCoords, setNewObstacleCoords] = useState(null);
    const user = auth.currentUser;
    const isEditing = !!courseId;

    useEffect(() => {
        if (isEditing) {
            const fetchCourse = async () => {
                const courseRef = doc(db, 'courses', courseId);
                const courseSnap = await getDoc(courseRef);
                if (courseSnap.exists()) {
                    const data = courseSnap.data();
                    setCourseName(data.name);
                    setStart(data.start);
                    setFinish(data.finish);
                    setObstacles(data.obstacles || []);
                }
            };
            fetchCourse();
        }
    }, [courseId, isEditing]);

    useEffect(() => {
        if (!start) return;
        const startLatLng = L.latLng(start.lat, start.lng);
        let pointsRemoved = false;
        const validObstacles = obstacles.filter(obs => {
            if (obs && typeof obs.lat === 'number' && typeof obs.lng === 'number') {
                const obsLatLng = L.latLng(obs.lat, obs.lng);
                return startLatLng.distanceTo(obsLatLng) <= 100;
            }
            pointsRemoved = true;
            return false;
        });
        setObstacles(validObstacles);
        if (finish && typeof finish.lat === 'number' && typeof finish.lng === 'number') {
            const finishLatLng = L.latLng(finish.lat, finish.lng);
            if (startLatLng.distanceTo(finishLatLng) > 100) {
                setFinish(null);
                pointsRemoved = true;
            }
        }
        if (pointsRemoved) {
            setInfo("Ett eller flera hinder/mål var utanför den nya 100m-radien och har tagits bort.");
        } else {
            setInfo("");
        }
    }, [start]);

    const handleMapClick = (latlng) => {
        const { lat, lng } = latlng;
        setInfo('');
        if (placementMode === 'start') {
            setStart({ lat, lng });
            setPlacementMode('obstacle');
        } else if (placementMode === 'obstacle') {
            setNewObstacleCoords({ lat, lng });
            setIsSelectorOpen(true);
        } else if (placementMode === 'finish') {
            setFinish({ lat, lng });
        }
    };

    const handleSelectObstacle = (obstacleId) => {
        const newObstacle = { ...newObstacleCoords, obstacleId };
        setObstacles([...obstacles, newObstacle]);
        setIsSelectorOpen(false);
        setNewObstacleCoords(null);
    };

    const handleSaveCourse = async () => {
        setError('');
        setSuccess('');
        if (!courseName.trim() || !start || obstacles.length === 0 || !finish) {
            setError("Alla fält (namn, start, minst ett hinder, mål) måste vara ifyllda.");
            return;
        }
        const courseData = { name: courseName, start, obstacles, finish, creatorId: user.uid, updatedAt: new Date() };
        try {
            if (isEditing) {
                await updateDoc(doc(db, 'courses', courseId), courseData);
                setSuccess("Banan har uppdaterats!");
            } else {
                await addDoc(collection(db, 'courses'), { ...courseData, createdAt: new Date() });
                setSuccess("Banan har sparats!");
                setCourseName(''); setStart(null); setFinish(null); setObstacles([]); setPlacementMode('start');
            }
            if(onSave) onSave();
        } catch (err) {
            setError("Ett fel uppstod när banan skulle sparas.");
        }
    };
    
    const gameAreaBounds = useMemo(() => {
        if (!start) return null;
        return L.latLng(start.lat, start.lng).toBounds(200);
    }, [start]);

    return (
        <div>
            {isSelectorOpen && <ObstacleSelectorModal onSelect={handleSelectObstacle} onCancel={() => setIsSelectorOpen(false)} />}
            <h2 className="text-2xl font-bold mb-4 text-gray-700">{isEditing ? 'Redigera Bana' : 'Skapa en ny bana'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-4">
                    <div className="soft-ui-card">
                        <label className="block text-sm font-semibold mb-2 text-gray-600">Banans namn</label>
                        <input type="text" value={courseName} onChange={(e) => setCourseName(e.target.value)} className="soft-ui-input" />
                    </div>
                    <div className="soft-ui-card space-y-2">
                        <p className="font-semibold text-gray-700">Placeringsläge:</p>
                        <div className="flex flex-col space-y-2">
                            <button onClick={() => setPlacementMode('start')} className={`soft-ui-button w-full text-left ${placementMode === 'start' ? 'soft-ui-button-primary' : ''}`}>1. Sätt Startpunkt {start && '✅'}</button>
                            <button onClick={() => setPlacementMode('obstacle')} className={`soft-ui-button w-full text-left ${placementMode === 'obstacle' ? 'soft-ui-button-primary' : ''}`}>2. Sätt Hinder ({obstacles.length})</button>
                            <button onClick={() => setPlacementMode('finish')} className={`soft-ui-button w-full text-left ${placementMode === 'finish' ? 'soft-ui-button-primary' : ''}`}>3. Sätt Målpunkt {finish && '✅'}</button>
                        </div>
                    </div>
                    {info && <p className="text-blue-600 bg-blue-100 p-2 rounded-md">{info}</p>}
                    {error && <p className="text-red-600 bg-red-100 p-2 rounded-md">{error}</p>}
                    {success && <p className="text-green-600 bg-green-100 p-2 rounded-md">{success}</p>}
                    <button onClick={handleSaveCourse} className="soft-ui-button soft-ui-button-green w-full">{isEditing ? 'Uppdatera Bana' : 'Spara Bana'}</button>
                </div>
                <div className="md:col-span-2 soft-ui-card h-96 md:h-[600px] rounded-lg overflow-hidden">
                    <MapContainer center={[56.6634, 16.3571]} zoom={16} scrollWheelZoom={true} className="h-full w-full rounded-lg" zoomControl={false}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <ZoomControl position="bottomleft" />
                        <MapClickHandler onMapClick={handleMapClick} />
                        <MapZoomController bounds={gameAreaBounds} />
                        {start && <Marker position={[start.lat, start.lng]} icon={startIcon}><Popup>Start</Popup></Marker>}
                        {finish && <Marker position={[finish.lat, finish.lng]} icon={finishIcon}><Popup>Mål</Popup></Marker>}
                        {obstacles.map((obs, index) => (
                            <Marker key={index} position={[obs.lat, obs.lng]} icon={obstacleIcon}>
                                <Popup>
                                    <b>Hinder {index + 1}</b><br/>ID: {obs.obstacleId}
                                    <button onClick={() => setObstacles(obstacles.filter((_, i) => i !== index))} className="ml-2 text-red-500 font-bold">X</button>
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                </div>
            </div>
        </div>
    );
};

export default CourseCreator;

