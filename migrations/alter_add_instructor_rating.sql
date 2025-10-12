-- Migration: add instructor_rating to workshops (safe for older PG versions)
-- Adds a numeric column to store instructor rating (0-5 scale with two decimals)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workshops' AND column_name = 'instructor_rating'
  ) THEN
    ALTER TABLE workshops ADD COLUMN instructor_rating NUMERIC(3,2);
  END IF;
END$$;

-- Optionally set a default value for existing rows (uncomment if desired)
-- UPDATE workshops SET instructor_rating = 0 WHERE instructor_rating IS NULL;

-- Create an index if you plan to query/filter by rating
-- CREATE INDEX IF NOT EXISTS idx_workshops_instructor_rating ON workshops (instructor_rating);
