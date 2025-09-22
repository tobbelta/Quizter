import { getVersionString, getFullVersionString } from '../version';

// File logger utility för att skriva loggar till fil istället för console
class FileLogger {
    constructor() {
        this.logs = [];
        this.playerId = null;
        this.playerName = null;
        this.isLeader = false;
        this.sessionStarted = false;
    }

    // Sätt spelarinformation
    setPlayerInfo(userId, displayName, isLeader = false) {
        this.playerId = userId;
        this.playerName = displayName || 'Okänd spelare';
        this.isLeader = isLeader;

        // Logga session-start med version-information (bara en gång)
        if (!this.sessionStarted) {
            this.sessionStarted = true;
            const sessionInfo = {
                version: getVersionString(),
                fullVersion: getFullVersionString(),
                player: `${isLeader ? 'LAGLEDARE' : 'SPELARE1'}(${this.playerName})`,
                playerId: userId,
                sessionStart: new Date().toISOString()
            };

            this.logs.push({
                timestamp: new Date().toLocaleTimeString('sv-SE', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    fractionalSecondDigits: 3
                }),
                player: `${isLeader ? 'LAGLEDARE' : 'SPELARE1'}(${this.playerName})`,
                playerId: userId,
                message: 'SESSION START',
                data: JSON.stringify(sessionInfo, null, 2),
                fullLine: `=== SESSION START ${getFullVersionString()} ===\n${JSON.stringify(sessionInfo, null, 2)}\n`
            });
        }
    }

    // Lägg till en logg med spelarinformation
    log(message, data = null) {
        const timestamp = new Date().toLocaleTimeString('sv-SE', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });

        const playerPrefix = this.isLeader ? 'LAGLEDARE' : 'SPELARE1';
        const playerInfo = `${playerPrefix}(${this.playerName})`;

        const logEntry = {
            timestamp,
            player: playerInfo,
            playerId: this.playerId,
            message,
            data: data ? JSON.stringify(data, null, 2) : null,
            fullLine: `[${timestamp}] ${playerInfo}: ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}`
        };

        this.logs.push(logEntry);

        // Håll bara de senaste 1000 loggarna i minnet
        if (this.logs.length > 1000) {
            this.logs = this.logs.slice(-1000);
        }
    }

    // Hämta alla loggar som text
    getLogsAsText() {
        return this.logs.map(entry => entry.fullLine).join('\n');
    }

    // Spara loggar till fil
    downloadLogs() {
        const content = this.getLogsAsText();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `geoquest-debug-${this.playerName}-${timestamp}.log`;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Rensa loggar
    clear() {
        this.logs = [];
    }

    // Hämta antal loggar
    getLogCount() {
        return this.logs.length;
    }
}

// Skapa en global instans
export const fileLogger = new FileLogger();

// Hjälpfunktioner
export const logToFile = (message, data = null) => {
    fileLogger.log(message, data);
};

export const setPlayerInfo = (userId, displayName, isLeader = false) => {
    fileLogger.setPlayerInfo(userId, displayName, isLeader);
};

export const downloadDebugLogs = () => {
    fileLogger.downloadLogs();
};

export const clearDebugLogs = () => {
    fileLogger.clear();
};

export default fileLogger;