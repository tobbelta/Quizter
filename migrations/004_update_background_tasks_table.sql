-- Migration: Add payload, error and finished_at to background_tasks
-- Run with: npx wrangler d1 execute DB --remote --file=migrations/004_update_background_tasks_table.sql

-- Add payload column to store task parameters as JSON
ALTER TABLE background_tasks ADD COLUMN payload TEXT;

-- Add error column to store error messages
ALTER TABLE background_tasks ADD COLUMN error TEXT;

-- Add finished_at column to track when task completed/failed
ALTER TABLE background_tasks ADD COLUMN finished_at INTEGER;

-- Update progress column comment (it now stores JSON object, not just a number)
-- Note: SQLite doesn't support column comments, but documenting here:
-- progress column should store JSON: {completed: number, total: number, phase: string, details?: string}
