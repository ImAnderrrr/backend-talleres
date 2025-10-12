-- Migration: create workshop_enrollments table (idempotent)
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid (safe if already exists)

CREATE TABLE IF NOT EXISTS workshop_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id VARCHAR(100) NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_email VARCHAR(255) NOT NULL,
  student_full_name VARCHAR(255),
  carnet_number VARCHAR(64),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'approved',
  attended BOOLEAN NOT NULL DEFAULT FALSE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workshop_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workshop_enrollments_workshop ON workshop_enrollments(workshop_id);
CREATE INDEX IF NOT EXISTS idx_workshop_enrollments_user ON workshop_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_workshop_enrollments_payment_status ON workshop_enrollments(payment_status);
