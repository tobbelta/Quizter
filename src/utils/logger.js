/**
 * En enkel logg-funktion som bara skriver ut meddelanden till konsolen
 * om debug-läget är aktivt.
 * @param {boolean} isDebug - En flagga som indikerar om debug-läget är på.
 * @param  {...any} args - Meddelandena som ska loggas.
 */
export const debugLog = (isDebug, ...args) => {
    if (isDebug) {
        // Lägger till ett prefix för att enkelt kunna identifiera debug-loggar i konsolen.
        console.log('[DEBUG]', ...args);
    }
};
