-- Migration: Extend provider_settings with model + encrypted credentials
-- Run with: npx wrangler d1 execute quizter-db --remote --file=migrations/005_add_provider_settings_fields.sql

CREATE TABLE IF NOT EXISTS provider_settings (
  provider_id TEXT PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked INTEGER,
  updated_at INTEGER
);

ALTER TABLE provider_settings ADD COLUMN purpose_settings TEXT;
ALTER TABLE provider_settings ADD COLUMN model TEXT;
ALTER TABLE provider_settings ADD COLUMN encrypted_api_key TEXT;
ALTER TABLE provider_settings ADD COLUMN api_key_hint TEXT;
