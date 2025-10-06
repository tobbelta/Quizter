/**
 * Error logging service
 * Loggar JavaScript-fel och viktiga händelser till Firestore för debugging
 */
import { db } from '../firebaseClient';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { analyticsService } from './analyticsService';

class ErrorLogService {
  constructor() {
    this.logsCollection = collection(db, 'errorLogs');
    this.setupGlobalErrorHandler();
  }

  /**
   * Fångar globala JavaScript-fel
   */
  setupGlobalErrorHandler() {
    if (typeof window === 'undefined') return;

    // Fånga ohanterade fel
    window.addEventListener('error', (event) => {
      this.logError({
        type: 'uncaught_error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    });

    // Fånga ohanterade promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logError({
        type: 'unhandled_rejection',
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
      });
    });
  }

  /**
   * Logga ett fel till Firestore
   */
  async logError(errorData) {
    try {
      const deviceId = analyticsService.getDeviceId();
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';

      await addDoc(this.logsCollection, {
        ...errorData,
        deviceId,
        userAgent,
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        timestamp: serverTimestamp(),
        level: 'error',
      });

      console.error('🔴 Error logged:', errorData);
    } catch (err) {
      console.error('Failed to log error to Firestore:', err);
    }
  }

  /**
   * Logga GPS-relaterad information
   */
  async logGPSDebug(debugData) {
    try {
      const deviceId = analyticsService.getDeviceId();

      await addDoc(this.logsCollection, {
        type: 'gps_debug',
        ...debugData,
        deviceId,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        timestamp: serverTimestamp(),
        level: 'debug',
      });

      console.log('📍 GPS debug logged:', debugData);
    } catch (err) {
      console.error('Failed to log GPS debug to Firestore:', err);
    }
  }

  /**
   * Logga ruttgenerering
   */
  async logRouteGeneration(routeData) {
    try {
      const deviceId = analyticsService.getDeviceId();

      await addDoc(this.logsCollection, {
        type: 'route_generation',
        ...routeData,
        deviceId,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        timestamp: serverTimestamp(),
        level: 'info',
      });

      console.log('🗺️ Route generation logged:', routeData);
    } catch (err) {
      console.error('Failed to log route generation to Firestore:', err);
    }
  }

  /**
   * Logga allmän info
   */
  async logInfo(message, data = {}) {
    try {
      const deviceId = analyticsService.getDeviceId();

      await addDoc(this.logsCollection, {
        type: 'info',
        message,
        data,
        deviceId,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        timestamp: serverTimestamp(),
        level: 'info',
      });

      console.log('ℹ️ Info logged:', message, data);
    } catch (err) {
      console.error('Failed to log info to Firestore:', err);
    }
  }
}

export const errorLogService = new ErrorLogService();
