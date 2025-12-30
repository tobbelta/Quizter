-- Ensure base tables exist (for older DBs that only created background_tasks)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  is_super_user BOOLEAN DEFAULT FALSE
);

-- Add user auth fields
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_salt TEXT;
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN verification_token TEXT;
ALTER TABLE users ADD COLUMN verification_expires INTEGER;
ALTER TABLE users ADD COLUMN updated_at INTEGER;

-- Track active participant session
ALTER TABLE participants ADD COLUMN active_instance_id TEXT;
ALTER TABLE participants ADD COLUMN active_instance_at INTEGER;

-- Email provider settings
CREATE TABLE IF NOT EXISTS email_settings (
  id TEXT PRIMARY KEY,
  config TEXT NOT NULL,
  updated_at INTEGER
);
