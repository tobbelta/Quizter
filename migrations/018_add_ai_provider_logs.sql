CREATE TABLE IF NOT EXISTS ai_provider_logs (
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
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_logs_task_id ON ai_provider_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_ai_provider_logs_provider ON ai_provider_logs(provider);
CREATE INDEX IF NOT EXISTS idx_ai_provider_logs_created_at ON ai_provider_logs(created_at);
