-- Migration: Add question_en column to questions table
-- Run with: npx wrangler d1 execute DB --file=migrations/003_add_multilingual_support.sql

-- Add missing English question column
-- (options_en and explanation_en already exist)
ALTER TABLE questions ADD COLUMN question_en TEXT;
