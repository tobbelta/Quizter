/**
 * Analytics Service - Hanterar besöksstatistik och användarspårning
 */
const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const buildQuery = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

const getDeviceType = () => {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobi|android/i.test(ua)) return 'mobile';
  return 'desktop';
};

const getOS = () => {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/windows nt/i.test(ua)) return 'Windows';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/mac os x/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'unknown';
};

const getBrowser = () => {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/edg\//i.test(ua)) return 'Edge';
  if (/chrome\//i.test(ua)) return 'Chrome';
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return 'Safari';
  if (/firefox\//i.test(ua)) return 'Firefox';
  return 'unknown';
};

const getTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  } catch {
    return 'unknown';
  }
};

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
    const resolvedMetadata = Object.fromEntries(Object.entries({ ...metadata }).filter(([, v]) => v !== undefined));
    const userId = resolvedMetadata.userId || resolvedMetadata.user_id || null;
    delete resolvedMetadata.userId;
    delete resolvedMetadata.user_id;

    const visitData = {
      deviceId,
      userId,
      eventType,
      timestamp: Date.now(),
      deviceType: getDeviceType(),
      os: getOS(),
      browser: getBrowser(),
      timezone: getTimezone(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      language: typeof navigator !== 'undefined' ? navigator.language : '',
      screenResolution: typeof window !== 'undefined'
        ? `${window.screen.width}x${window.screen.height}`
        : '',
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      metadata: resolvedMetadata
    };

    await fetch(`${API_BASE_URL}/api/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(visitData)
    });
  } catch (error) {
    console.error('Error logging visit:', error);
  }
};

/**
 * Hämtar besöksstatistik för admin
 */
export const getAnalytics = async (filters = {}, userEmail = '') => {
  try {
    const query = buildQuery(filters);
    const response = await fetch(`${API_BASE_URL}/api/analytics${query}`, {
      headers: { 'x-user-email': userEmail || '' }
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Kunde inte hämta analytics');
    }
    return data.events || [];
  } catch (error) {
    console.warn('Analytics retrieval failed:', error);
    return [];
  }
};

/**
 * Hämtar statistik för en specifik enhet
 */
export const getDeviceStats = async (deviceId, userEmail = '') => {
  if (!deviceId) return [];
  return getAnalytics({ deviceId }, userEmail);
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
export const getAggregatedStats = async (userEmail = '') => {
  try {
    const allEvents = await getAnalytics({ limit: 10000 }, userEmail);
    const toDate = (value) => {
      if (!value) return null;
      if (value.toDate) return value.toDate();
      if (typeof value === 'number') return new Date(value);
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

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
      const eventDate = toDate(event.timestamp);
      if (eventDate) {
        const date = eventDate.toISOString().split('T')[0];
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
