-- Add payment settings and tracking tables

CREATE TABLE payment_settings (
  id TEXT PRIMARY KEY,
  config TEXT NOT NULL,
  updated_at INTEGER
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  run_id TEXT,
  participant_id TEXT,
  provider_id TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  payment_type TEXT NOT NULL,
  status TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  provider_payment_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  period TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  provider_payment_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

ALTER TABLE runs ADD COLUMN payment_policy TEXT;
ALTER TABLE runs ADD COLUMN payment_status TEXT;
ALTER TABLE runs ADD COLUMN payment_total_amount INTEGER;
ALTER TABLE runs ADD COLUMN payment_host_amount INTEGER;
ALTER TABLE runs ADD COLUMN payment_player_amount INTEGER;
ALTER TABLE runs ADD COLUMN payment_currency TEXT;
ALTER TABLE runs ADD COLUMN payment_provider_id TEXT;
ALTER TABLE runs ADD COLUMN expected_players INTEGER;
ALTER TABLE runs ADD COLUMN anonymous_policy TEXT;
ALTER TABLE runs ADD COLUMN max_anonymous INTEGER;
ALTER TABLE runs ADD COLUMN host_payment_id TEXT;

ALTER TABLE participants ADD COLUMN payment_status TEXT;
ALTER TABLE participants ADD COLUMN payment_amount INTEGER;
ALTER TABLE participants ADD COLUMN payment_currency TEXT;
ALTER TABLE participants ADD COLUMN payment_provider_id TEXT;
ALTER TABLE participants ADD COLUMN payment_id TEXT;
ALTER TABLE participants ADD COLUMN is_anonymous BOOLEAN DEFAULT FALSE;
