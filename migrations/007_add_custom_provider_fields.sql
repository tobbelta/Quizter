-- Migration: Add custom provider fields to provider_settings
-- Run with: npx wrangler d1 execute quizter-db --remote --file=migrations/007_add_custom_provider_fields.sql

ALTER TABLE provider_settings ADD COLUMN display_name TEXT;
ALTER TABLE provider_settings ADD COLUMN base_url TEXT;
ALTER TABLE provider_settings ADD COLUMN extra_headers TEXT;
ALTER TABLE provider_settings ADD COLUMN supports_response_format BOOLEAN DEFAULT TRUE;
ALTER TABLE provider_settings ADD COLUMN max_questions_per_request INTEGER;
ALTER TABLE provider_settings ADD COLUMN provider_type TEXT;
ALTER TABLE provider_settings ADD COLUMN is_custom BOOLEAN DEFAULT FALSE;
