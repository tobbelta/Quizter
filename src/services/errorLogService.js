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
    this.breadcrumbs = []; // Håller koll på användarens senaste handlingar
    this.maxBreadcrumbs = 20; // Spara max 20 senaste händelser
    this.setupGlobalErrorHandler();
  }

  /**
   * Logga en användarhändelse (breadcrumb)
   */
  addBreadcrumb(category, message, data = {}) {
    const breadcrumb = {
      category,
      message,
      data,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
    };

    this.breadcrumbs.push(breadcrumb);

    // Behåll bara de senaste
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }

    console.log('🍞 Breadcrumb:', breadcrumb);
  }

  /**
   * Rensa breadcrumbs (t.ex. efter lyckad navigering)
   */
  clearBreadcrumbs() {
    this.breadcrumbs = [];
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

      // Extrahera detaljerad information från stack trace
      const stackInfo = this.parseStackTrace(errorData.stack);

      await addDoc(this.logsCollection, {
        ...errorData,
        deviceId,
        userAgent,
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
        timestamp: serverTimestamp(),
        level: 'error',
        // Lägg till parsad stack info
        stackInfo,
        // Browser/Device info
        browserInfo: {
          platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
          language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
          screenResolution: typeof window !== 'undefined'
            ? `${window.screen.width}x${window.screen.height}`
            : 'unknown',
          viewport: typeof window !== 'undefined'
            ? `${window.innerWidth}x${window.innerHeight}`
            : 'unknown',
        },
        // Lägg till breadcrumbs för att visa vad användaren gjorde innan felet
        breadcrumbs: [...this.breadcrumbs],
      });

      console.error('🔴 Error logged:', errorData);
    } catch (err) {
      console.error('Failed to log error to Firestore:', err);
    }
  }

  /**
   * Parsear stack trace för att extrahera fil, rad, kolumn
   */
  parseStackTrace(stack) {
    if (!stack) return null;

    const lines = stack.split('\n');
    const frames = [];

    for (const line of lines.slice(0, 5)) { // Ta bara de 5 första ramarna
      // Matcha olika stack trace-format
      const chromeMatch = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
      const firefoxMatch = line.match(/(.+?)@(.+?):(\d+):(\d+)/);
      const simpleMatch = line.match(/(.+?):(\d+):(\d+)/);

      if (chromeMatch) {
        frames.push({
          function: chromeMatch[1].trim(),
          file: chromeMatch[2],
          line: parseInt(chromeMatch[3]),
          column: parseInt(chromeMatch[4])
        });
      } else if (firefoxMatch) {
        frames.push({
          function: firefoxMatch[1].trim(),
          file: firefoxMatch[2],
          line: parseInt(firefoxMatch[3]),
          column: parseInt(firefoxMatch[4])
        });
      } else if (simpleMatch) {
        frames.push({
          file: simpleMatch[1],
          line: parseInt(simpleMatch[2]),
          column: parseInt(simpleMatch[3])
        });
      }
    }

    return frames.length > 0 ? frames : null;
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
