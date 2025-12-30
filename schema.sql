-- ============================================================================
-- Cloudflare D1 Schema for Quizter/GeoQuest
--
-- This schema translates the implicit Firestore structure into a relational
-- SQL structure suitable for D1 (SQLite).
--
-- Conventions:
-- - Timestamps are stored as INTEGER (Unix epoch seconds) for easy handling.
-- - JSON data is stored as TEXT. It must be parsed/stringified in the Worker.
-- - Foreign keys are defined to enforce relational integrity.
-- ============================================================================

-- Drop tables if they exist for easy re-creation during development
DROP TABLE IF EXISTS answers;
DROP TABLE IF EXISTS participants;
DROP TABLE IF EXISTS runs;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS age_group_targets;
DROP TABLE IF EXISTS target_audiences;
DROP TABLE IF EXISTS age_groups;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS donations;
DROP TABLE IF EXISTS provider_settings;
DROP TABLE IF EXISTS ai_rule_sets;
DROP TABLE IF EXISTS background_tasks;

-- ----------------------------------------------------------------------------
-- `users` table
-- Stores registered user information.
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  is_super_user BOOLEAN DEFAULT FALSE
);

-- ----------------------------------------------------------------------------
-- `questions` table
-- The core table for all quiz questions.
-- ----------------------------------------------------------------------------
CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  question_sv TEXT NOT NULL,
  question_en TEXT,
  options_sv TEXT NOT NULL, -- JSON array: '["Option 1", "Option 2", ...]'
  options_en TEXT,         -- JSON array
  correct_option INTEGER NOT NULL,
  explanation_sv TEXT,
  explanation_en TEXT,
  background_sv TEXT,
  background_en TEXT,
  age_groups TEXT,         -- JSON array: '["children", "adults"]'
  categories TEXT,         -- JSON array: '["Geografi", "Historia"]'
  difficulty TEXT,         -- 'easy', 'medium', 'hard'
  audience TEXT,           -- 'kid', 'family', 'adult'
  target_audience TEXT,    -- 'swedish', 'english', 'international'
  source TEXT,
  illustration_svg TEXT,
  illustration_provider TEXT,
  illustration_generated_at INTEGER,
  ai_validated BOOLEAN DEFAULT FALSE,
  ai_validation_result TEXT, -- JSON object with validation details
  ai_validated_at INTEGER,
  time_sensitive BOOLEAN DEFAULT FALSE,
  best_before_at INTEGER,
  quarantined BOOLEAN DEFAULT FALSE,
  quarantined_at INTEGER,
  quarantine_reason TEXT,
  manually_approved BOOLEAN DEFAULT FALSE,
  manually_rejected BOOLEAN DEFAULT FALSE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

-- ----------------------------------------------------------------------------
-- `categories` table
-- Defines configurable question categories and AI prompt guidance.
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
  name TEXT PRIMARY KEY,
  description TEXT,
  prompt TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

-- ----------------------------------------------------------------------------
-- `age_groups` and `target_audiences`
-- Configurable metadata for age groups and target audiences.
-- ----------------------------------------------------------------------------
CREATE TABLE age_groups (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  min_age INTEGER,
  max_age INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE TABLE target_audiences (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE TABLE age_group_targets (
  age_group_id TEXT NOT NULL,
  target_audience_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (age_group_id, target_audience_id)
);

-- ----------------------------------------------------------------------------
-- `runs` table
-- Represents a single quiz walk instance.
-- ----------------------------------------------------------------------------
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  join_code TEXT NOT NULL UNIQUE,
  created_by TEXT, -- Can be a user_id or an anonymous identifier
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'closed'
  closed_at INTEGER,
  question_ids TEXT NOT NULL, -- JSON array of question IDs
  checkpoints TEXT NOT NULL,    -- JSON array of checkpoint objects
  route TEXT,                 -- JSON object for the route polyline
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- `participants` table
-- Represents a player in a specific run. Can be anonymous or a registered user.
-- ----------------------------------------------------------------------------
CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  user_id TEXT, -- Nullable for anonymous participants
  alias TEXT NOT NULL, -- Display name for the run
  joined_at INTEGER NOT NULL,
  completed_at INTEGER,
  last_seen INTEGER,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- `answers` table
-- Stores each answer given by a participant.
-- ----------------------------------------------------------------------------
CREATE TABLE answers (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_index INTEGER NOT NULL,
  is_correct BOOLEAN NOT NULL,
  answered_at INTEGER NOT NULL,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- Other tables (donations, provider_settings, background_tasks)
-- ----------------------------------------------------------------------------
CREATE TABLE donations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  run_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'sek',
  stripe_payment_intent_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
);

CREATE TABLE provider_settings (
  provider_id TEXT PRIMARY KEY, -- e.g., 'anthropic', 'openai'
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked INTEGER,
  purpose_settings TEXT, -- JSON per purpose settings
  model TEXT,
  encrypted_api_key TEXT,
  api_key_hint TEXT,
  display_name TEXT,
  base_url TEXT,
  extra_headers TEXT,
  supports_response_format BOOLEAN DEFAULT TRUE,
  max_questions_per_request INTEGER,
  provider_type TEXT,
  is_custom BOOLEAN DEFAULT FALSE,
  updated_at INTEGER
);

CREATE TABLE ai_rule_sets (
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  config TEXT NOT NULL,
  updated_at INTEGER,
  PRIMARY KEY (scope_type, scope_id)
);

CREATE TABLE background_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  task_type TEXT NOT NULL, -- e.g., 'GENERATE_QUESTIONS', 'VALIDATE_QUESTIONS'
  status TEXT NOT NULL, -- 'queued', 'processing', 'completed', 'failed'
  label TEXT,
  description TEXT,
  payload TEXT, -- JSON with task parameters
  progress TEXT, -- JSON with progress details
  result TEXT, -- JSON with task result
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  started_at INTEGER,
  finished_at INTEGER
);

-- ----------------------------------------------------------------------------
-- Messages (admin -> user)
-- ----------------------------------------------------------------------------
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  created_by TEXT
);

CREATE TABLE message_states (
  message_id TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  read_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  PRIMARY KEY (message_id, recipient_type, recipient_id)
);
