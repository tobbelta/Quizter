const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const getEmailSettings = async (userEmail) => {
  const response = await fetch(`${API_BASE_URL}/api/emailSettings`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': userEmail || ''
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte hämta e-postinställningar.');
  }
  return data;
};

const saveEmailSettings = async (settings, userEmail) => {
  const response = await fetch(`${API_BASE_URL}/api/emailSettings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': userEmail || ''
    },
    body: JSON.stringify({ settings })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte spara e-postinställningar.');
  }
  return data;
};

export const emailSettingsService = {
  getEmailSettings,
  saveEmailSettings
};
