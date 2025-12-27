ALTER TABLE questions ADD COLUMN time_sensitive BOOLEAN DEFAULT FALSE;
ALTER TABLE questions ADD COLUMN best_before_at INTEGER;
ALTER TABLE questions ADD COLUMN quarantined BOOLEAN DEFAULT FALSE;
ALTER TABLE questions ADD COLUMN quarantined_at INTEGER;
ALTER TABLE questions ADD COLUMN quarantine_reason TEXT;
