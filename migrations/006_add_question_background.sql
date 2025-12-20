-- Migration: Add background fields to questions table
-- Run with: npx wrangler d1 execute DB --remote --file=migrations/006_add_question_background.sql

ALTER TABLE questions ADD COLUMN background_sv TEXT;
ALTER TABLE questions ADD COLUMN background_en TEXT;
