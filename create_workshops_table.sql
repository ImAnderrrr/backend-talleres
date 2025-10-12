-- SQL para crear la tabla workshops
CREATE TABLE IF NOT EXISTS workshops (
  id VARCHAR(100) PRIMARY KEY,
  title TEXT NOT NULL,
  short_description TEXT,
  description TEXT,
  instructor_name VARCHAR(200),
  instructor_title VARCHAR(200),
  instructor_bio TEXT,
  instructor_image VARCHAR(500),
  instructor_rating NUMERIC(3,2),
  category VARCHAR(100),
  date TIMESTAMPTZ,
  time VARCHAR(50),
  duration VARCHAR(100),
  schedule VARCHAR(200),
  location VARCHAR(200),
  -- maps_link removed by policy (was: VARCHAR(500))
  capacity INTEGER,
  enrolled INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'draft',
  image VARCHAR(500),
  equipment JSONB,
  requirements JSONB,
  agenda JSONB,
  tags JSONB,
  level VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workshops_status ON workshops (status);
CREATE INDEX IF NOT EXISTS idx_workshops_category ON workshops (category);
