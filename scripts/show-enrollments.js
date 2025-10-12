#!/usr/bin/env node
// Quick script: list recent workshop enrollments.
// Usage:
//   node scripts/show-enrollments.js              -> last 20
//   node scripts/show-enrollments.js WORKSHOP_ID  -> last 20 for that workshop

const path = require('path');
const fs = require('fs');

// Load env (if present) relative to backend root
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

const { Client } = require('pg');

async function run() {
  const workshopId = process.argv[2];
  const client = new Client({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || 'postgres',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || ''
  });

  try {
    await client.connect();
    let sql = `SELECT id, workshop_id, user_id, user_email, student_full_name, carnet_number, payment_status, attended, enrolled_at\n               FROM workshop_enrollments`;
    const params = [];
    if (workshopId) {
      sql += ' WHERE workshop_id = $1';
      params.push(workshopId);
    }
    sql += ' ORDER BY enrolled_at DESC LIMIT 20';
    const { rows } = await client.query(sql, params);
    if (!rows.length) {
      console.log(workshopId ? `No enrollments found for workshop ${workshopId}` : 'No enrollments found.');
    } else {
      console.table(rows);
      console.log(`\nRows: ${rows.length}`);
    }
  } catch (err) {
    console.error('Error querying enrollments:', err.message);
  } finally {
    await client.end();
  }
}

run();
