/**
 * Background Location Service
 * Hanterar GPS-tracking även när appen är i bakgrunden eller skärmen är släckt
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

// Registrera plugins dynamiskt (lazy loading för webb-kompatibilitet)
const BackgroundGeolocationPlugin = Capacitor.isNativePlatform() 
  ? registerPlugin('BackgroundGeolocation')
  : null;

const LocalNotifications = Capacitor.isNativePlatform()
  ? registerPlugin('LocalNotifications')
  : null;

const Haptics = Capacitor.isNativePlatform()
  ? registerPlugin('Haptics')
  : null;

const ImpactStyle = { Heavy: 'HEAVY', Medium: 'MEDIUM', Light: 'LIGHT' };

class BackgroundLocationService {
  constructor() {
    this.isNative = Capacitor.isNativePlatform();
    this.watcher = null;
    this.listeners = new Set();
    this.distanceCallback = null;
    this.totalDistance = 0;
    this.lastPosition = null;
    this.distanceSinceLastQuestion = 0;
    this.distanceThreshold = 500; // Default 500m
    this.isTracking = false;
  }

  /**
   * Startar background location tracking
   */
  async startTracking(options = {}) {
    const { distanceBetweenQuestions = 500, onDistanceReached } = options;
    
    this.distanceThreshold = distanceBetweenQuestions;
    this.distanceCallback = onDistanceReached;
    this.isTracking = true;

    // Begär permissions
    await this.requestPermissions();

    if (this.isNative) {
      // Native app - använd background geolocation
      await this.startNativeTracking();
    } else {
      // Webb - använd standard geolocation (begränsat i bakgrund)
      await this.startWebTracking();
    }
  }

  /**
   * Stoppar tracking
   */
  async stopTracking() {
    this.isTracking = false;
    
    if (this.watcher) {
      if (this.isNative && BackgroundGeolocationPlugin) {
        await BackgroundGeolocationPlugin.removeWatcher({ id: this.watcher });
      } else {
        navigator.geolocation.clearWatch(this.watcher);
      }
      this.watcher = null;
    }

    this.resetDistance();
  }

  /**
   * Native tracking (Android/iOS)
   */
  async startNativeTracking() {
    if (!BackgroundGeolocationPlugin) {
      console.warn('[BackgroundLocation] Plugin not available, falling back to web');
      await this.startWebTracking();
      return;
    }

    try {
      this.watcher = await BackgroundGeolocationPlugin.addWatcher(
        {
          // Tracking-inställningar
          backgroundMessage: 'GeoQuest spårar din position för att trigga frågor.',
          backgroundTitle: 'GeoQuest Aktiv',
          requestPermissions: true,
          stale: false,
          distanceFilter: 10, // Uppdatera var 10:e meter
        },
        (location, error) => {
          if (error) {
            console.error('[BackgroundLocation] Error:', error);
            return;
          }

          if (location) {
            this.handleLocationUpdate(location);
          }
        }
      );

      console.log('[BackgroundLocation] Native tracking started');
    } catch (error) {
      console.error('[BackgroundLocation] Failed to start native tracking:', error);
      // Fallback till web tracking
      await this.startWebTracking();
    }
  }

  /**
   * Web tracking (begränsat till förgrund)
   */
  async startWebTracking() {
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported');
    }

    this.watcher = navigator.geolocation.watchPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          time: position.timestamp
        };
        this.handleLocationUpdate(location);
      },
      (error) => {
        console.error('[BackgroundLocation] Web tracking error:', error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000
      }
    );

    console.log('[BackgroundLocation] Web tracking started');
  }

  /**
   * Hanterar location updates
   */
  handleLocationUpdate(location) {
    if (!this.isTracking) return;

    const currentPos = {
      lat: location.latitude,
      lng: location.longitude,
      accuracy: location.accuracy,
      timestamp: location.time || Date.now()
    };

    // Filtrera bort dålig precision
    if (currentPos.accuracy > 50) {
      console.warn('[BackgroundLocation] Poor accuracy, skipping:', currentPos.accuracy);
      return;
    }

    // Beräkna distans från senaste position
    if (this.lastPosition) {
      const distance = this.calculateDistance(
        this.lastPosition.lat,
        this.lastPosition.lng,
        currentPos.lat,
        currentPos.lng
      );

      // Filtrera outliers (mer än 100m på en gång = troligen fel)
      if (distance > 100) {
        console.warn('[BackgroundLocation] Outlier detected, skipping:', distance);
        this.lastPosition = currentPos;
        return;
      }

      this.totalDistance += distance;
      this.distanceSinceLastQuestion += distance;

      // Notifiera listeners
      this.notifyListeners({
        totalDistance: this.totalDistance,
        distanceSinceLastQuestion: this.distanceSinceLastQuestion,
        currentPosition: currentPos
      });

      // Kolla om vi nått threshold
      if (this.distanceSinceLastQuestion >= this.distanceThreshold) {
        this.triggerQuestion();
      }
    }

    this.lastPosition = currentPos;
  }

  /**
   * Triggar fråga och notifierar användaren
   */
  async triggerQuestion() {
    console.log('[BackgroundLocation] Distance threshold reached! Triggering question...');

    // Vibrera
    await this.vibrate();

    // Visa notifikation om appen är i bakgrunden
    if (this.isNative) {
      await this.showNotification();
    }

    // Kalla callback
    if (this.distanceCallback) {
      this.distanceCallback({
        totalDistance: this.totalDistance,
        distanceSinceLastQuestion: this.distanceSinceLastQuestion
      });
    }

    // Återställ distansräknare
    this.distanceSinceLastQuestion = 0;
  }

  /**
   * Vibrerar enheten
   */
  async vibrate() {
    if (!this.isNative) {
      // Webb - använd Vibration API
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
      return;
    }

    if (!Haptics) {
      console.warn('[BackgroundLocation] Haptics plugin not available');
      return;
    }

    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
      await new Promise(resolve => setTimeout(resolve, 200));
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (error) {
      console.warn('[BackgroundLocation] Haptics not available:', error);
    }
  }

  /**
   * Visar notifikation
   */
  async showNotification() {
    if (!LocalNotifications) {
      console.warn('[BackgroundLocation] LocalNotifications plugin not available');
      return;
    }

    try {
      // Begär permissions
      const permission = await LocalNotifications.requestPermissions();
      if (permission.display !== 'granted') {
        console.warn('[BackgroundLocation] Notification permission denied');
        return;
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            title: 'Ny fråga väntar! 🎯',
            body: `Du har gått ${Math.round(this.distanceSinceLastQuestion)}m. Öppna appen för att svara!`,
            id: Date.now(),
            schedule: { at: new Date(Date.now() + 100) },
            sound: 'default',
            attachments: null,
            actionTypeId: '',
            extra: null
          }
        ]
      });
    } catch (error) {
      console.error('[BackgroundLocation] Failed to show notification:', error);
    }
  }

  /**
   * Återställer distansräknare (efter svarad fråga)
   */
  resetDistance() {
    this.distanceSinceLastQuestion = 0;
  }

  /**
   * Lägg till listener för location updates
   */
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notifiera alla listeners
   */
  notifyListeners(data) {
    this.listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error('[BackgroundLocation] Listener error:', error);
      }
    });
  }

  /**
   * Begär permissions
   */
  async requestPermissions() {
    if (!this.isNative) return;

    try {
      // Location permissions
      if (BackgroundGeolocationPlugin) {
        await BackgroundGeolocationPlugin.requestPermissions();
      }

      // Notification permissions
      if (LocalNotifications) {
        await LocalNotifications.requestPermissions();
      }
    } catch (error) {
      console.error('[BackgroundLocation] Permission request failed:', error);
    }
  }

  /**
   * Beräkna distans mellan två koordinater (Haversine formula)
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Jordens radie i meter
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Getters
   */
  getTotalDistance() {
    return this.totalDistance;
  }

  getDistanceSinceLastQuestion() {
    return this.distanceSinceLastQuestion;
  }

  isActive() {
    return this.isTracking;
  }
}

// Singleton instance
const backgroundLocationService = new BackgroundLocationService();

export default backgroundLocationService;
