-- SQL para crear la tabla banks
CREATE TABLE IF NOT EXISTS banks (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(32),
  account_number VARCHAR(128) NOT NULL,
  account_holder VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda por nombre
CREATE INDEX IF NOT EXISTS idx_banks_name ON banks (lower(name));
