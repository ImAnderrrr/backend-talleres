const db = require('../db');

async function run() {
  try {
    console.log('Starting migration: add deposit fields');

    const queries = [
      "ALTER TABLE deposits ADD COLUMN IF NOT EXISTS amount numeric(12,2);",
      "ALTER TABLE deposits ADD COLUMN IF NOT EXISTS reference_number VARCHAR(128);",
      "ALTER TABLE deposits ADD COLUMN IF NOT EXISTS carnet_number VARCHAR(64);",
      "ALTER TABLE deposits ADD COLUMN IF NOT EXISTS file_mime VARCHAR(128);",
      "ALTER TABLE deposits ADD COLUMN IF NOT EXISTS file_path VARCHAR(1024);",
      "ALTER TABLE deposits ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255);",
      "ALTER TABLE deposits ADD COLUMN IF NOT EXISTS review_notes TEXT;",
      "ALTER TABLE deposits ADD COLUMN IF NOT EXISTS review_date TIMESTAMPTZ;"
    ];

    for (const q of queries) {
      console.log('Executing:', q);
      await db.query(q);
    }

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
