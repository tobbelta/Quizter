const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const getEmailLogs = async ({ userEmail, status = 'all', limit = 50, offset = 0, providerId = '' } = {}) => {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.set('status', status);
  if (providerId) params.set('providerId', providerId);
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const response = await fetch(`${API_BASE_URL}/api/emailLogs?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': userEmail || ''
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte hämta e-postloggar.');
  }
  return data;
};

const resendEmail = async ({ id, userEmail }) => {
  const response = await fetch(`${API_BASE_URL}/api/emailLogs/resend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': userEmail || ''
    },
    body: JSON.stringify({ id })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte skicka om mailet.');
  }
  return data;
};

export const emailLogService = {
  getEmailLogs,
  resendEmail
};
