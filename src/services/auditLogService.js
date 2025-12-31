const API_BASE_URL = '';

const getAuditLogs = async ({ limit = 50, offset = 0, targetType, actorEmail, action, userEmail }) => {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  if (targetType) params.set('targetType', targetType);
  if (actorEmail) params.set('actorEmail', actorEmail);
  if (action) params.set('action', action);

  const response = await fetch(`${API_BASE_URL}/api/auditLogs?${params.toString()}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': userEmail || ''
    }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte hämta audit-loggar.');
  }
  return data.logs || [];
};

export const auditLogService = {
  getAuditLogs
};
