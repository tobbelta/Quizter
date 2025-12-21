-- Migration: Add started_at column to background_tasks
-- Run with: npx wrangler d1 execute DB --remote --file=migrations/010_add_background_tasks_started_at.sql

ALTER TABLE background_tasks ADD COLUMN started_at INTEGER;
