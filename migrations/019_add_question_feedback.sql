CREATE TABLE IF NOT EXISTS question_feedback (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  rating INTEGER,
  verdict TEXT,
  issues TEXT,
  comment TEXT,
  user_id TEXT,
  user_email TEXT,
  device_id TEXT,
  user_role TEXT,
  category TEXT,
  age_group TEXT,
  difficulty TEXT,
  target_audience TEXT,
  generation_provider TEXT,
  generation_model TEXT,
  validation_provider TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS question_feedback_question_idx
  ON question_feedback(question_id);

CREATE INDEX IF NOT EXISTS question_feedback_context_idx
  ON question_feedback(feedback_type, category, age_group, difficulty, target_audience, created_at);

CREATE INDEX IF NOT EXISTS question_feedback_provider_idx
  ON question_feedback(generation_provider, validation_provider, created_at);
