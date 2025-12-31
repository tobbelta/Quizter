-- Create email events log table
CREATE TABLE IF NOT EXISTS email_events (
  id TEXT PRIMARY KEY,
  provider_id TEXT,
  provider_type TEXT,
  status TEXT NOT NULL,
  to_email TEXT,
  subject TEXT,
  payload TEXT,
  response TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  resend_of TEXT
);
