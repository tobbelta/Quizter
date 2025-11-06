-- Migration: Create background_tasks table in Cloudflare D1
-- Run with: npx wrangler d1 execute DB --remote --file=migrations/002_create_background_tasks_table.sql

CREATE TABLE IF NOT EXISTS background_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_type TEXT NOT NULL,  -- 'generation', 'validation', 'emoji-regeneration'
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
  label TEXT,
  description TEXT,
  progress INTEGER DEFAULT 0,
  total INTEGER DEFAULT 100,
  result TEXT,  -- JSON with results/errors
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_background_tasks_user_id ON background_tasks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_background_tasks_status ON background_tasks(status);
