import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';

// Hook för att hantera en realistisk spelsimulering
export const useGameSimulation = (game, course, onSimulatePosition) => {
    const [isSimulating, setIsSimulating] = useState(false);
    const [status, setStatus] = useState('Inaktiv');
    const currentPositionRef = useRef(null);
    const targetPositionRef = useRef(null);
    const intervalRef = useRef(null);

    // Funktion för att slumpa en startposition inom en given radie från banans start
    const randomizeStartPosition = useCallback(() => {
        if (!course || !course.start) return;
        const center = L.latLng(course.start.lat, course.start.lng);
        const radius = 80; // 80 meter radie
        const r = radius * Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const x = center.lng + (r / 111320) * Math.cos(theta);
        const y = center.lat + (r / 111132) * Math.sin(theta);
        const randomPos = { lat: y, lng: x };
        currentPositionRef.current = randomPos;
        onSimulatePosition({ latitude: randomPos.lat, longitude: randomPos.lng });
        setStatus('Startposition slumpad');
    }, [course, onSimulatePosition]);

    // Stoppar den pågående rörelsesimuleringen
    const stopMovement = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsSimulating(false);
    }, []);

    // **OMSKRIVEN FUNKTION**
    // Startar rörelsen mot målet med en robust, inbyggd metod
    const startMovement = useCallback(() => {
        stopMovement(); // Säkerställer att bara en loop körs
        setIsSimulating(true);

        intervalRef.current = setInterval(() => {
            if (!currentPositionRef.current || !targetPositionRef.current) {
                stopMovement();
                return;
            }

            const currentPos = currentPositionRef.current;
            const targetPos = targetPositionRef.current;

            const currentLatLng = L.latLng(currentPos.lat, currentPos.lng);
            const targetLatLng = L.latLng(targetPos.lat, targetPos.lng);

            const distance = currentLatLng.distanceTo(targetLatLng);

            // Om vi är framme vid målet
            if (distance < 3) {
                stopMovement();
                setStatus(prev => prev.replace('Går till', 'Framme vid'));
                // Sätt exakt position för att undvika små avvikelser
                onSimulatePosition({ latitude: targetPos.lat, longitude: targetPos.lng });
                return;
            }

            // Realistisk hastighet (ca 5 km/h)
            const speed = 1.4; // meter per sekund
            // Hur lång tid skulle det ta att gå hela sträckan?
            const totalSeconds = distance / speed;
            // Hur stor andel av sträckan ska vi gå på en sekund?
            const fraction = 1 / totalSeconds;

            // Enkel och robust linjär interpolering av koordinaterna
            const newLat = currentPos.lat + (targetPos.lat - currentPos.lat) * fraction;
            const newLng = currentPos.lng + (targetPos.lng - currentPos.lng) * fraction;
            
            const newPosition = { lat: newLat, lng: newLng };
            currentPositionRef.current = newPosition;
            onSimulatePosition({ latitude: newPosition.lat, longitude: newPosition.lng });
        }, 1000);
    }, [onSimulatePosition, stopMovement]);

    // Huvudlogiken för att bestämma och flytta till nästa mål
    const moveToNextTarget = useCallback(() => {
        if (!game || !course) return;

        // Om ingen startposition finns, slumpa en
        if (!currentPositionRef.current) {
            randomizeStartPosition();
            return;
        }

        let nextTarget = null;
        let nextStatus = '';

        // 1. Gå till startlinjen om spelet inte har börjat
        if (game.status !== 'started') {
            nextTarget = course.start;
            nextStatus = 'Går till Start';
        } else {
            // 2. Hitta nästa olösta hinder
            const nextObstacleIndex = game.solvedObstacles.findIndex(solved => !solved);
            if (nextObstacleIndex !== -1 && course.obstacles[nextObstacleIndex]) {
                nextTarget = course.obstacles[nextObstacleIndex];
                nextStatus = `Går till Hinder ${nextObstacleIndex + 1}`;
            } else {
                // 3. Gå till mål om alla hinder är lösta
                nextTarget = course.finish;
                nextStatus = 'Går till Mål';
            }
        }

        if (nextTarget) {
            targetPositionRef.current = nextTarget;
            setStatus(nextStatus);
            startMovement();
        } else {
            setStatus('Inget mer mål att gå till');
        }
    }, [game, course, startMovement, randomizeStartPosition]);
    
    // Städa upp när komponenten avmonteras
    useEffect(() => {
        return () => stopMovement();
    }, [stopMovement]);

    return { isSimulating, simulationStatus: status, startSimulation: moveToNextTarget };
};

