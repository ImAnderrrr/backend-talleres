-- Ensures carnet uniqueness ignoring hyphens and case
-- Example keys: 0904-22-12345 and 09042212345 collide

-- Create a functional unique index to enforce carnet uniqueness, case- and hyphen-insensitive
CREATE UNIQUE INDEX IF NOT EXISTS users_carnet_unique_key
  ON public.users (REPLACE(UPPER(carnet_number), '-', ''))
  WHERE carnet_number IS NOT NULL AND carnet_number <> '';
