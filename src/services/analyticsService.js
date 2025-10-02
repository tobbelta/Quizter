/**
 * Analytics Service - Hanterar besöksstatistik och användarspårning
 */
import { getFirebaseDb } from '../firebaseClient';
import { collection, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp, updateDoc } from 'firebase/firestore';

const db = getFirebaseDb();

/**
 * Genererar eller hämtar unikt device ID från localStorage
 */
const getDeviceId = () => {
  if (typeof window === 'undefined') return null;

  let deviceId = localStorage.getItem('geoquest:deviceId');

  if (!deviceId) {
    // Generera nytt device ID
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('geoquest:deviceId', deviceId);
  }

  return deviceId;
};

/**
 * Loggar en besökshändelse
 */
export const logVisit = async (eventType, metadata = {}) => {
  try {
    const deviceId = getDeviceId();
    if (!deviceId) return;

    const visitData = {
      deviceId,
      eventType, // 'page_view', 'create_run', 'join_run', 'complete_run', 'donation', etc.
      timestamp: serverTimestamp(),
      metadata: Object.fromEntries(Object.entries({
        ...metadata,
        userAgent: navigator.userAgent,
        language: navigator.language,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        path: window.location.pathname
      }).filter(([_, v]) => v !== undefined))
    };

    await addDoc(collection(db, 'analytics'), visitData);
  } catch (error) {
    console.error('Error logging visit:', error);
  }
};

/**
 * Hämtar besöksstatistik för admin
 */
export const getAnalytics = async (filters = {}) => {
  try {
    let q = query(collection(db, 'analytics'), orderBy('timestamp', 'desc'));

    if (filters.eventType) {
      q = query(q, where('eventType', '==', filters.eventType));
    }

    if (filters.limit) {
      q = query(q, limit(filters.limit));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return [];
  }
};

/**
 * Hämtar statistik för en specifik enhet
 */
export const getDeviceStats = async (deviceId) => {
  try {
    const q = query(
      collection(db, 'analytics'),
      where('deviceId', '==', deviceId),
      orderBy('timestamp', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching device stats:', error);
    return [];
  }
};

/**
 * Kopplar device ID till en användare när de registrerar sig/loggar in
 */
export const linkDeviceToUser = async (userId) => {
  try {
    const deviceId = getDeviceId();
    if (!deviceId) return;

    // Uppdatera alla befintliga analytics events för denna enhet
    const q = query(
      collection(db, 'analytics'),
      where('deviceId', '==', deviceId)
    );

    const snapshot = await getDocs(q);
    const updatePromises = snapshot.docs.map(doc =>
      updateDoc(doc.ref, { userId })
    );

    await Promise.all(updatePromises);

    // Logga kopplingen
    await logVisit('device_linked', { userId });
  } catch (error) {
    console.error('Error linking device to user:', error);
  }
};

/**
 * Loggar donation
 */
export const logDonation = async (amount, paymentIntentId, metadata = {}) => {
  try {
    await logVisit('donation', {
      amount,
      paymentIntentId,
      ...metadata
    });

    // Spara donation info i localStorage också
    localStorage.setItem('geoquest:hasDonated', 'true');
    localStorage.setItem('geoquest:donationTimestamp', new Date().toISOString());
  } catch (error) {
    console.error('Error logging donation:', error);
  }
};

/**
 * Kontrollera om enheten har donerat
 */
export const hasDonated = () => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('geoquest:hasDonated') === 'true';
};

/**
 * Hämta aggregerad statistik
 */
export const getAggregatedStats = async () => {
  try {
    const allEvents = await getAnalytics({ limit: 10000 });

    const stats = {
      totalVisits: allEvents.length,
      uniqueDevices: new Set(allEvents.map(e => e.deviceId)).size,
      eventsByType: {},
      devicesByDate: {},
      donations: {
        count: 0,
        total: 0
      }
    };

    allEvents.forEach(event => {
      // Count by event type
      stats.eventsByType[event.eventType] = (stats.eventsByType[event.eventType] || 0) + 1;

      // Count donations
      if (event.eventType === 'donation') {
        stats.donations.count++;
        stats.donations.total += event.metadata?.amount || 0;
      }

      // Count by date
      if (event.timestamp?.toDate) {
        const date = event.timestamp.toDate().toISOString().split('T')[0];
        stats.devicesByDate[date] = stats.devicesByDate[date] || new Set();
        stats.devicesByDate[date].add(event.deviceId);
      }
    });

    return stats;
  } catch (error) {
    console.error('Error getting aggregated stats:', error);
    return null;
  }
};

export const analyticsService = {
  getDeviceId,
  logVisit,
  getAnalytics,
  getDeviceStats,
  linkDeviceToUser,
  logDonation,
  hasDonated,
  getAggregatedStats
};
