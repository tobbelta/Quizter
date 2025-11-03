/**
 * Analytics Service - Hanterar besöksstatistik och användarspårning
 */
// Legacy Firebase/Firestore analytics logic removed. Use Cloudflare API endpoint instead.

// Helper functions commented out (not used without API implementation)
// const getDeviceType = () => { ... }
// const getOS = () => { ... }
// const getBrowser = () => { ... }
// const getTimezone = () => { ... }

/**
 * Genererar eller hämtar unikt device ID från localStorage
 */
const getDeviceId = () => {
  if (typeof window === 'undefined') return null;

  let deviceId = localStorage.getItem('quizter:deviceId');

  if (!deviceId) {
    // Generera nytt device ID
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('quizter:deviceId', deviceId);
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

    // TODO: Replace with Cloudflare API endpoint
    // const visitData = {
    //   deviceId,
    //   eventType,
    //   timestamp: Date.now(),
    //   deviceType: getDeviceType(),
    //   os: getOS(),
    //   browser: getBrowser(),
    //   timezone: getTimezone(),
    //   metadata: Object.fromEntries(Object.entries({
    //     ...metadata,
    //     userAgent: navigator.userAgent,
    //     language: navigator.language,
    //     screenResolution: `${window.screen.width}x${window.screen.height}`,
    //     path: window.location.pathname
    //   }).filter(([_, v]) => v !== undefined))
    // };
    // await fetch('/api/analytics', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(visitData)
    // });
  } catch (error) {
    console.error('Error logging visit:', error);
  }
};

/**
 * Hämtar besöksstatistik för admin
 */
export const getAnalytics = async (filters = {}) => {
  // TODO: Replace with Cloudflare API endpoint
  // const response = await fetch('/api/analytics');
  // return await response.json();
  
  console.warn('Analytics retrieval not yet implemented with Cloudflare API');
  return [];
};

/**
 * Hämtar statistik för en specifik enhet
 */
export const getDeviceStats = async () => {
  // TODO: Replace with Cloudflare API endpoint
  // const response = await fetch(`/api/analytics?deviceId=${deviceId}`);
  // return await response.json();
  
  console.warn('Device stats retrieval not yet implemented with Cloudflare API');
  return [];
};

/**
 * Kopplar device ID till en användare när de registrerar sig/loggar in
 */
export const linkDeviceToUser = async (userId) => {
  try {
    const deviceId = getDeviceId();
    if (!deviceId) return;

    // TODO: Replace with Cloudflare API endpoint
    // await fetch(`/api/analytics/linkDeviceToUser`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ deviceId, userId })
    // });
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
    localStorage.setItem('quizter:hasDonated', 'true');
    localStorage.setItem('quizter:donationTimestamp', new Date().toISOString());
  } catch (error) {
    console.error('Error logging donation:', error);
  }
};

/**
 * Kontrollera om enheten har donerat
 */
export const hasDonated = () => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('quizter:hasDonated') === 'true';
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
