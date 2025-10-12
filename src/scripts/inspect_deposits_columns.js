const db = require('../db');

async function run() {
  try {
    const sql = `SELECT column_name, data_type, character_maximum_length
                 FROM information_schema.columns
                 WHERE table_name = 'deposits'
                 ORDER BY ordinal_position`;
    const res = await db.query(sql);
    console.log('deposits columns:\n', res.rows);
    process.exit(0);
  } catch (err) {
    console.error('Error querying columns:', err);
    process.exit(1);
  }
}

run();
