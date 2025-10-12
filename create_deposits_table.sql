-- SQL para crear la tabla deposits
CREATE TABLE IF NOT EXISTS deposits (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100),
  bank_id VARCHAR(50) NOT NULL,
  bank_name VARCHAR(200),
  bank_account_number VARCHAR(100),
  bank_account_holder VARCHAR(200),
  bank_color VARCHAR(50),
  document_number VARCHAR(50) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  file_name VARCHAR(200),
  file_size INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits (status);
CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits (user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_email ON deposits (lower(email));
