const safeStringify = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
};

const MAX_PAYLOAD_CHARS = 20000;

const truncateText = (value, limit = MAX_PAYLOAD_CHARS) => {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'string' ? value : safeStringify(value);
  if (!text) return null;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…(truncated ${text.length - limit} chars)`;
};

export const ensureProviderCallLogsSchema = async (db) => {
  const exists = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_provider_logs'"
  ).first();
  if (!exists) {
    await db.prepare(`
      CREATE TABLE ai_provider_logs (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        user_id TEXT,
        phase TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT,
        status TEXT NOT NULL,
        request_payload TEXT,
        response_payload TEXT,
        error TEXT,
        duration_ms INTEGER,
        metadata TEXT,
        created_at INTEGER NOT NULL
      )
    `).run();
  }

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_provider_logs_task_id ON ai_provider_logs(task_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_provider_logs_provider ON ai_provider_logs(provider)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_provider_logs_created_at ON ai_provider_logs(created_at)').run();
};

export const logProviderCall = async (db, payload = {}) => {
  if (!db) return;
  const {
    taskId = null,
    userId = null,
    phase = 'unknown',
    provider,
    model = null,
    status = 'unknown',
    requestPayload = null,
    responsePayload = null,
    error = null,
    durationMs = null,
    metadata = null,
  } = payload;

  if (!provider) return;
  await ensureProviderCallLogsSchema(db);

  const requestText = truncateText(requestPayload);
  const responseText = truncateText(responsePayload);
  const metadataText = truncateText(metadata);
  const now = Date.now();

  await db.prepare(
    `INSERT INTO ai_provider_logs (
      id,
      task_id,
      user_id,
      phase,
      provider,
      model,
      status,
      request_payload,
      response_payload,
      error,
      duration_ms,
      metadata,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    taskId,
    userId,
    phase,
    provider,
    model,
    status,
    requestText,
    responseText,
    error,
    durationMs,
    metadataText,
    now
  ).run();
};
