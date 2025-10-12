const db = require('../db');

async function run() {
  try {
    console.log('Starting migration: expand file_name to TEXT');
    const queries = [
      "ALTER TABLE deposits ALTER COLUMN file_name TYPE TEXT;"
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
