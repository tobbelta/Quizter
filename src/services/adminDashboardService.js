const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const fetchStats = async () => {
  const response = await fetch(`${API_BASE_URL}/api/getAdminDashboardStats`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Kunde inte hämta dashboard-data');
  }

  return data.stats;
};

export const adminDashboardService = {
  fetchStats,
};
