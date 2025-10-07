/**
 * Service för att hantera användarpreferenser som sparas lokalt på enheten
 */

const PREFERENCES_KEY = 'geoquest:preferences';

class UserPreferencesService {
  /**
   * Hämtar sparade preferenser från localStorage
   */
  getPreferences() {
    try {
      const stored = localStorage.getItem(PREFERENCES_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('[UserPreferences] Kunde inte läsa preferenser:', error);
      return {};
    }
  }

  /**
   * Sparar preferenser till localStorage
   */
  savePreferences(preferences) {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('userPreferences:changed'));
      }
    } catch (error) {
      console.error('[UserPreferences] Kunde inte spara preferenser:', error);
    }
  }

  /**
   * Hämtar sparat alias
   */
  getAlias() {
    const prefs = this.getPreferences();
    return prefs.alias || '';
  }

  /**
   * Sparar alias
   */
  saveAlias(alias) {
    const prefs = this.getPreferences();
    prefs.alias = alias;
    this.savePreferences(prefs);
  }

  /**
   * Tar bort sparat alias
   */
  removeAlias() {
    const prefs = this.getPreferences();
    if ('alias' in prefs) {
      delete prefs.alias;
      this.savePreferences(prefs);
    }
  }

  /**
   * Hämtar sparad kontaktuppgift
   */
  getContact() {
    const prefs = this.getPreferences();
    return prefs.contact || '';
  }

  /**
   * Sparar kontaktuppgift
   */
  saveContact(contact) {
    const prefs = this.getPreferences();
    prefs.contact = contact;
    this.savePreferences(prefs);
  }

  /**
   * Tar bort sparad kontaktuppgift
   */
  removeContact() {
    const prefs = this.getPreferences();
    if ('contact' in prefs) {
      delete prefs.contact;
      this.savePreferences(prefs);
    }
  }

  /**
   * Rensar alla sparade preferenser
   */
  clearPreferences() {
    try {
      localStorage.removeItem(PREFERENCES_KEY);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('userPreferences:changed'));
      }
    } catch (error) {
      console.error('[UserPreferences] Kunde inte rensa preferenser:', error);
    }
  }
}

export const userPreferencesService = new UserPreferencesService();
