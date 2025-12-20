const API_BASE_URL = process.env.REACT_APP_API_URL || '';

export const categoryService = {
  getCategories: async ({ includeInactive = false, userEmail } = {}) => {
    const params = new URLSearchParams();
    if (includeInactive) {
      params.set('includeInactive', '1');
    }
    const url = `${API_BASE_URL}/api/categories${params.toString() ? `?${params.toString()}` : ''}`;
    const headers = {};
    if (userEmail) {
      headers['x-user-email'] = userEmail;
    }

    const response = await fetch(url, { headers });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Kunde inte hämta kategorier');
    }
    return data.categories || [];
  },

  updateCategories: async ({ categories, userEmail }) => {
    const response = await fetch(`${API_BASE_URL}/api/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(userEmail ? { 'x-user-email': userEmail } : {})
      },
      body: JSON.stringify({ categories })
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Kunde inte spara kategorier');
    }
    return data.categories || [];
  }
};
