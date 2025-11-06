/**
 * Formaterar ett datum till relativ tid (e.g., "2 minuter sedan", "Just nu")
 * @param {Date} date - Datum att formatera
 * @returns {string} - Relativ tid som sträng
 */
export const getRelativeTime = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return '—';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 10) {
    return 'Just nu';
  }
  if (diffSeconds < 60) {
    return `${diffSeconds} sekunder sedan`;
  }
  if (diffMinutes === 1) {
    return '1 minut sedan';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minuter sedan`;
  }
  if (diffHours === 1) {
    return '1 timme sedan';
  }
  if (diffHours < 24) {
    return `${diffHours} timmar sedan`;
  }
  if (diffDays === 1) {
    return 'Igår';
  }
  if (diffDays < 7) {
    return `${diffDays} dagar sedan`;
  }
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? '1 vecka sedan' : `${weeks} veckor sedan`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? '1 månad sedan' : `${months} månader sedan`;
  }

  const years = Math.floor(diffDays / 365);
  return years === 1 ? '1 år sedan' : `${years} år sedan`;
};

/**
 * Formaterar datum till kort format (YYYY-MM-DD HH:MM)
 * @param {Date} date - Datum att formatera
 * @returns {string} - Formaterat datum
 */
export const formatShortDateTime = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Formaterar varaktighet mellan två datum
 * @param {Date} start - Starttid
 * @param {Date} end - Sluttid
 * @returns {string} - Formaterad varaktighet
 */
export const formatDuration = (start, end) => {
  if (!start || !end || !(start instanceof Date) || !(end instanceof Date)) {
    return '—';
  }

  const milliseconds = end.getTime() - start.getTime();
  if (Number.isNaN(milliseconds) || milliseconds < 0) {
    return '—';
  }

  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 1) {
    return '<1s';
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  
  if (minutes < 60) {
    return remainderSeconds > 0 ? `${minutes}m ${remainderSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  
  if (hours < 24) {
    return remainderMinutes > 0 ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainderHours = hours % 24;
  return remainderHours > 0 ? `${days}d ${remainderHours}h` : `${days}d`;
};

/**
 * Beräknar hur länge ett pågående jobb har körts
 * @param {Date} startDate - När jobbet startade
 * @returns {string} - Formaterad körtid
 */
export const getElapsedTime = (startDate) => {
  if (!startDate || !(startDate instanceof Date) || isNaN(startDate.getTime())) {
    return '—';
  }

  return formatDuration(startDate, new Date());
};
