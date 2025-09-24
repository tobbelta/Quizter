// Vibration utility för mobila enheter

/**
 * Kontrollera om vibration är tillgängligt
 */
export const isVibrationSupported = () => {
    return 'vibrate' in navigator;
};

/**
 * Enkel vibration
 * @param {number} duration - Varaktighet i millisekunder
 */
export const simpleVibrate = (duration = 100) => {
    if (isVibrationSupported()) {
        navigator.vibrate(duration);
    }
};

/**
 * Vibrationsmönster för olika händelser
 */
export const VibrationPatterns = {
    // Kort puls för start
    START: [100],

    // Dubbelpuls för hinder
    OBSTACLE: [100, 50, 100],

    // Längre vibration för mål
    FINISH: [200, 100, 200, 100, 200],

    // Kort bekräftelse för korrekt svar
    SUCCESS: [50, 50, 50],

    // Längre för fel svar
    ERROR: [300]
};

/**
 * Spela upp ett vibrationsmönster
 * @param {number[]} pattern - Array med vibrations- och pauslängder
 */
export const vibratePattern = (pattern) => {
    if (isVibrationSupported()) {
        navigator.vibrate(pattern);
    }
};

// Spårning för att undvika vibrationsspam
const lastVibrations = {
    start: 0,
    obstacle: 0,
    finish: 0
};

/**
 * Bekvämlighetsmetoder för olika händelser med spam-skydd
 */
export const vibrationEvents = {
    reachedStart: () => {
        const now = Date.now();
        if (now - lastVibrations.start > 5000) { // 5 sekunder cooldown
            console.log('📳 Vibration: Nådde start');
            vibratePattern(VibrationPatterns.START);
            lastVibrations.start = now;
        }
    },

    reachedObstacle: () => {
        const now = Date.now();
        if (now - lastVibrations.obstacle > 5000) { // 5 sekunder cooldown
            console.log('📳 Vibration: Nådde hinder');
            vibratePattern(VibrationPatterns.OBSTACLE);
            lastVibrations.obstacle = now;
        }
    },

    reachedFinish: () => {
        const now = Date.now();
        if (now - lastVibrations.finish > 10000) { // 10 sekunder cooldown för mål
            console.log('📳 Vibration: Nådde mål');
            vibratePattern(VibrationPatterns.FINISH);
            lastVibrations.finish = now;
        }
    },

    correctAnswer: () => {
        // Alltid tillåt vibrationer för svar (ingen cooldown)
        console.log('📳 Vibration: Korrekt svar');
        vibratePattern(VibrationPatterns.SUCCESS);
    },

    wrongAnswer: () => {
        // Alltid tillåt vibrationer för svar (ingen cooldown)
        console.log('📳 Vibration: Fel svar');
        vibratePattern(VibrationPatterns.ERROR);
    }
};

/**
 * Stoppa pågående vibration
 */
export const stopVibration = () => {
    if (isVibrationSupported()) {
        navigator.vibrate(0);
    }
};