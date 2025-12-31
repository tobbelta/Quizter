const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const resendVerification = async ({ userId, email, userEmail }) => {
  const response = await fetch(`${API_BASE_URL}/api/users/resendVerification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': userEmail || ''
    },
    body: JSON.stringify({ userId, email })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte skicka om verifieringsmail.');
  }
  return data;
};

export const userService = {
  resendVerification
};
