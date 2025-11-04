-- Migration: Create questions table in Cloudflare D1
-- Run with: npx wrangler d1 execute DB --file=migrations/001_create_questions_table.sql

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  options TEXT NOT NULL,  -- JSON array of answer options
  correctOption INTEGER NOT NULL,
  explanation TEXT,
  emoji TEXT DEFAULT '❓',
  category TEXT DEFAULT 'Allmän',
  difficulty TEXT DEFAULT 'medium',
  createdAt TEXT NOT NULL,  -- ISO 8601 timestamp
  updatedAt TEXT NOT NULL,  -- ISO 8601 timestamp
  createdBy TEXT DEFAULT 'system',
  aiGenerated INTEGER DEFAULT 0,  -- SQLite uses 0/1 for boolean
  validated INTEGER DEFAULT 0,
  provider TEXT,  -- AI provider used (openai, gemini, anthropic, mistral)
  model TEXT  -- Model name used
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category);
CREATE INDEX IF NOT EXISTS idx_questions_createdAt ON questions(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_questions_aiGenerated ON questions(aiGenerated);
