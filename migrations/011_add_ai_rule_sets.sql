CREATE TABLE IF NOT EXISTS ai_rule_sets (
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  config TEXT NOT NULL,
  updated_at INTEGER,
  PRIMARY KEY (scope_type, scope_id)
);
