const API_BASE_URL = '';

const getProfile = async ({ userId } = {}) => {
  const response = await fetch(`${API_BASE_URL}/api/profile`, {
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId || ''
    }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte hämta profil.');
  }
  return data.user;
};

const updateProfile = async ({ userId, name, email, currentPassword, newPassword }) => {
  const response = await fetch(`${API_BASE_URL}/api/profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId || ''
    },
    body: JSON.stringify({
      userId,
      name,
      email,
      currentPassword,
      newPassword
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte uppdatera profilen.');
  }
  return data;
};

export const profileService = {
  getProfile,
  updateProfile
};
