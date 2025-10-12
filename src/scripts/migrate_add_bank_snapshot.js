const db = require('../db');

async function run() {
  try {
    console.log('Starting migration: add bank snapshot columns to deposits');

    const queries = [
      "ALTER TABLE deposits ADD COLUMN IF NOT EXISTS bank_name VARCHAR(200);",
      "ALTER TABLE deposits ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(100);",
      "ALTER TABLE deposits ADD COLUMN IF NOT EXISTS bank_account_holder VARCHAR(200);",
      "ALTER TABLE deposits ADD COLUMN IF NOT EXISTS bank_color VARCHAR(50);",
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
