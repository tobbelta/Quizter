
import { firebaseConfig, getCachedIdToken } from '../firebase';

const CRITICAL_UPDATE_FIELDS = ['isActive', 'lastSeen', 'inactiveReason', 'isVisible'];

const buildCommitConfig = (gameId, userId, token) => {
    const { projectId, apiKey } = firebaseConfig || {};
    if (!projectId || !apiKey || !token) {
        return null;
    }

    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
    const commitUrl = `${baseUrl}?key=${apiKey}&access_token=${encodeURIComponent(token)}`;
    const documentName = `projects/${projectId}/databases/(default)/documents/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(userId)}`;

    return { commitUrl, documentName };
};

export const sendPlayerStatusBeacon = ({ gameId, userId, isActive, isVisible, reason }) => {
    if (!gameId || !userId) {
        return false;
    }

    const token = getCachedIdToken();
    if (!token) {
        console.warn('Ingen ID-token tillgänglig för Firestore-beacon.');
        return false;
    }

    const config = buildCommitConfig(gameId, userId, token);
    if (!config) {
        console.warn('Saknar Firestore-projektkonfiguration för beacon.');
        return false;
    }

    const { commitUrl, documentName } = config;

    const body = JSON.stringify({
        writes: [
            {
                update: {
                    name: documentName,
                    fields: {
                        isActive: { booleanValue: Boolean(isActive) },
                        isVisible: { booleanValue: Boolean(isVisible) },
                        inactiveReason: reason ? { stringValue: reason } : { nullValue: null },
                        lastSeen: { timestampValue: new Date().toISOString() }
                    }
                },
                updateMask: {
                    fieldPaths: CRITICAL_UPDATE_FIELDS
                },
                currentDocument: {
                    exists: true
                }
            }
        ]
    });

    try {
        let beaconSent = false;
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            const blob = new Blob([body], { type: 'application/json' });
            beaconSent = navigator.sendBeacon(commitUrl, blob);
        }

        if (!beaconSent) {
            fetch(commitUrl, {
                method: 'POST',
                keepalive: true,
                headers: {
                    'Content-Type': 'application/json'
                },
                body
            })
                .then((response) => {
                    if (!response.ok) {
                        console.error(`Beacon Firestore update misslyckades: ${response.status} ${response.statusText}`);
                    }
                })
                .catch((error) => {
                    console.error('Beacon Firestore update misslyckades:', error);
                });
        }

        return true;
    } catch (error) {
        console.error('Kunde inte skicka Firestore-beacon:', error);
        return false;
    }
};
