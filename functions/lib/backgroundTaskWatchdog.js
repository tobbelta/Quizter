const DEFAULT_IDLE_TIMEOUT_MS = 120000;
const DEFAULT_TOTAL_TIMEOUT_MS = 10 * 60 * 1000;

const parseNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const safeParseJSON = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const buildBaseQuery = () => `
  SELECT id, user_id, status, progress, created_at, updated_at
  FROM background_tasks
  WHERE status IN ('processing', 'running', 'pending')
`;

const resolveTimeouts = (debug) => {
  const idleMs = parseNumber(debug?.watchdogIdleMs) || DEFAULT_IDLE_TIMEOUT_MS;
  const totalMs = parseNumber(debug?.watchdogTotalMs) || DEFAULT_TOTAL_TIMEOUT_MS;
  return { idleMs, totalMs };
};

const resolveTimestamp = (value, fallback) => {
  const parsed = parseNumber(value);
  if (parsed !== null) return parsed;
  const fallbackParsed = parseNumber(fallback);
  if (fallbackParsed !== null) return fallbackParsed;
  return null;
};

export const markStaleBackgroundTasks = async (db, filters = {}) => {
  const now = Date.now();
  let query = buildBaseQuery();
  const params = [];

  if (filters.taskId) {
    query += ' AND id = ?';
    params.push(filters.taskId);
  } else if (filters.userId) {
    query += ' AND user_id = ?';
    params.push(filters.userId);
  }

  const { results } = await db.prepare(query).bind(...params).all();
  const rows = results || [];

  for (const row of rows) {
    const progress = safeParseJSON(row.progress) || {};
    const details = progress.details || {};
    const debug = details.debug || {};
    const nextValidationAt = resolveTimestamp(details.nextValidationAt, null);
    const heartbeatAt = resolveTimestamp(details.heartbeatAt, row.updated_at || row.created_at);
    const startedAt = resolveTimestamp(debug.startedAt, row.created_at || heartbeatAt);
    const { idleMs: idleLimit, totalMs: totalLimit } = resolveTimeouts(debug);

    if (!heartbeatAt || !startedAt) {
      continue;
    }

    if (nextValidationAt && nextValidationAt > now) {
      continue;
    }

    const idleMs = now - heartbeatAt;
    const totalMs = now - startedAt;
    const isIdleStale = idleMs > idleLimit;
    const isTotalStale = totalMs > totalLimit;

    if (!isIdleStale && !isTotalStale) {
      continue;
    }

    const reason = isIdleStale
      ? `Watchdog timeout: ingen aktivitet på ${Math.round(idleMs / 1000)}s`
      : `Watchdog timeout: total tid ${Math.round(totalMs / 1000)}s`;

    const updatedProgress = {
      ...progress,
      phase: reason,
      details: {
        ...details,
        lastMessage: reason,
        watchdog: {
          idleMs,
          totalMs,
          idleLimitMs: idleLimit,
          totalLimitMs: totalLimit
        }
      }
    };

    const resultPayload = {
      error: reason,
      watchdog: {
        idleMs,
        totalMs,
        idleLimitMs: idleLimit,
        totalLimitMs: totalLimit
      },
      debug
    };

    console.warn('[backgroundTaskWatchdog] Marking stale task:', {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      reason
    });

    await db.prepare(`
      UPDATE background_tasks
      SET status = ?,
          error = ?,
          result = ?,
          progress = ?,
          updated_at = ?,
          finished_at = ?
      WHERE id = ?
    `).bind(
      'failed',
      reason,
      JSON.stringify(resultPayload),
      JSON.stringify(updatedProgress),
      now,
      now,
      row.id
    ).run();
  }
};
