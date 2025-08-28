import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import Spinner from '../shared/Spinner';

const JsonDataScreen = () => {
    const { gameId } = useParams();
    const [jsonData, setJsonData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const user = auth.currentUser;

    useEffect(() => {
        const fetchGameData = async () => {
            if (!user) {
                setError("Du måste vara inloggad för att se denna sida.");
                setLoading(false);
                return;
            }

            try {
                const gameRef = doc(db, 'games', gameId);
                const gameSnap = await getDoc(gameRef);

                if (!gameSnap.exists()) {
                    setError("Spelet hittades inte.");
                    setLoading(false);
                    return;
                }

                const gameData = gameSnap.data();
                
                const teamSnap = await getDoc(doc(db, 'teams', gameData.teamId));
                if (!teamSnap.exists()) {
                    setError("Tillhörande lag hittades inte.");
                    setLoading(false);
                    return;
                }
                
                const teamData = teamSnap.data();

                // Säkerhetskontroll: Se till att den inloggade användaren är med i laget
                if (!teamData.memberIds.includes(user.uid)) {
                    setError("Åtkomst nekad. Du är inte medlem i detta spels lag.");
                    setLoading(false);
                    return;
                }

                const courseSnap = await getDoc(doc(db, 'courses', gameData.courseId));
                
                const detailedObstacles = await Promise.all(
                    (courseSnap.data().obstacles || []).map(async (obs) => {
                        const obstacleDoc = await getDoc(doc(db, 'obstacles', obs.obstacleId));
                        return {
                            position: { lat: obs.lat, lng: obs.lng },
                            details: obstacleDoc.exists() ? obstacleDoc.data() : { error: "Hinder hittades ej" }
                        };
                    })
                );
                
                const fullCourseData = { ...courseSnap.data(), obstacles: detailedObstacles };

                const fullGameData = {
                    gameDetails: gameData,
                    teamDetails: teamData,
                    courseDetails: fullCourseData,
                };
                
                setJsonData(fullGameData);

            } catch (err) {
                console.error("Error fetching game JSON data:", err);
                setError("Ett fel uppstod vid hämtning av speldata.");
            } finally {
                setLoading(false);
            }
        };

        fetchGameData();
    }, [gameId, user]);

    if (loading) {
        return <div className="flex items-center justify-center h-screen"><Spinner /></div>;
    }

    if (error) {
        return <div className="p-4 bg-red-100 text-red-800 font-mono">{error}</div>;
    }

    return (
        <div className="bg-gray-800 text-green-400 font-mono p-4 min-h-screen">
            <pre><code>{JSON.stringify(jsonData, null, 2)}</code></pre>
        </div>
    );
};

export default JsonDataScreen;
