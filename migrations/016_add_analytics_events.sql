CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  user_id TEXT,
  event_type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  device_type TEXT,
  os TEXT,
  browser TEXT,
  timezone TEXT,
  user_agent TEXT,
  language TEXT,
  screen_resolution TEXT,
  path TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_events_device ON analytics_events(device_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
