const API_BASE_URL = process.env.REACT_APP_API_URL || '';
const CACHE_TTL_MS = 2 * 60 * 1000;

let cachedConfig = null;
let cachedAt = 0;
let inFlight = null;

const fetchAudienceConfig = async ({ includeInactive = false, userEmail } = {}) => {
  const params = new URLSearchParams();
  if (includeInactive) {
    params.set('includeInactive', '1');
  }
  const url = `${API_BASE_URL}/api/audiences${params.toString() ? `?${params.toString()}` : ''}`;
  const headers = {};
  if (userEmail) {
    headers['x-user-email'] = userEmail;
  }
  const response = await fetch(url, { headers });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Kunde inte hämta ålders-/målgrupper');
  }
  return {
    ageGroups: data.ageGroups || [],
    targetAudiences: data.targetAudiences || [],
    mappings: data.mappings || []
  };
};

export const audienceService = {
  getAudienceConfig: async ({ includeInactive = false, userEmail, force = false } = {}) => {
    const now = Date.now();
    if (!force && cachedConfig && now - cachedAt < CACHE_TTL_MS && !includeInactive) {
      return cachedConfig;
    }
    if (!inFlight) {
      inFlight = fetchAudienceConfig({ includeInactive, userEmail }).finally(() => {
        inFlight = null;
      });
    }
    const config = await inFlight;
    if (!includeInactive) {
      cachedConfig = config;
      cachedAt = now;
    }
    return config;
  },

  updateAudienceConfig: async ({ ageGroups, targetAudiences, userEmail }) => {
    const response = await fetch(`${API_BASE_URL}/api/audiences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(userEmail ? { 'x-user-email': userEmail } : {})
      },
      body: JSON.stringify({ ageGroups, targetAudiences })
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Kunde inte spara ålders-/målgrupper');
    }
    const config = {
      ageGroups: data.ageGroups || [],
      targetAudiences: data.targetAudiences || [],
      mappings: data.mappings || []
    };
    cachedConfig = config;
    cachedAt = Date.now();
    return config;
  }
};
