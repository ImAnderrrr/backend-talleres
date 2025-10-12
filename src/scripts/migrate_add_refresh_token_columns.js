const db = require('../db');
const dotenv = require('dotenv');
if (process.env.NODE_ENV !== 'production') dotenv.config();

async function run() {
  console.log('Starting migration: add refresh_token columns to users');
  try {
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token TEXT;");
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMP;");
    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
