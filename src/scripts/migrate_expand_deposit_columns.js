const db = require('../db');

async function run() {
  try {
    console.log('Starting migration: expand deposit varchar columns to TEXT');

    const queries = [
      "ALTER TABLE deposits ALTER COLUMN full_name TYPE TEXT;",
      "ALTER TABLE deposits ALTER COLUMN bank_account_number TYPE TEXT;",
      "ALTER TABLE deposits ALTER COLUMN user_id TYPE TEXT;",
      "ALTER TABLE deposits ALTER COLUMN email TYPE TEXT;"
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
