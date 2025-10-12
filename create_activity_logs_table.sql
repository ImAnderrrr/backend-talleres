-- Migration: create activity_logs table
-- Columns: id, actor_email, actor_id, type, payload (jsonb), created_at
CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_email TEXT NULL,
  actor_id UUID NULL,
  type TEXT NOT NULL,
  payload JSONB NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index to speed queries by created_at
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs (created_at DESC);
