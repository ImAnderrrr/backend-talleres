const db = require('../src/db')

async function run() {
  try {
    console.log('Running workshops migration (idempotent)...')
    const sql = `
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS image VARCHAR(500);
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS equipment JSONB;
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS requirements JSONB;
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS agenda JSONB;
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS tags JSONB;
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS short_description TEXT;
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS instructor_name VARCHAR(200);
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS instructor_title VARCHAR(200);
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS instructor_bio TEXT;
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS instructor_image VARCHAR(500);
  -- maps_link column intentionally removed by policy
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS level VARCHAR(50);
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS duration VARCHAR(100);
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS schedule VARCHAR(200);
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE IF EXISTS workshops ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `
    await db.query(sql)
    console.log('Migration applied successfully.')
    process.exit(0)
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
}

run()
