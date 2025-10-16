#!/usr/bin/env node
/**
 * Quick admin user creator.
 * Usage (PowerShell):
 *   $env:PGHOST="localhost"; $env:PGPORT="5432"; $env:PGDATABASE="talleres"; $env:PGUSER="postgres"; $env:PGPASSWORD="your_pass"; node scripts/create-admin.js -e admin@miumg.edu.gt -p "SuperSeguro123" -n "Admin UMG"
 * Or with .env configured: `node scripts/create-admin.js -e admin@miumg.edu.gt -p "SuperSeguro123" -n "Admin UMG"`
 */
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../src/db');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { email: null, password: null, name: 'Administrador', carnet: null, force: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '-e' || a === '--email') && args[i+1]) { out.email = args[++i]; continue; }
    if ((a === '-p' || a === '--password') && args[i+1]) { out.password = args[++i]; continue; }
    if ((a === '-n' || a === '--name') && args[i+1]) { out.name = args[++i]; continue; }
    if ((a === '-c' || a === '--carnet') && args[i+1]) { out.carnet = args[++i]; continue; }
    if (a === '--force' || a === '-f') { out.force = true; continue; }
    if (a === '-h' || a === '--help') { out.help = true; }
  }
  return out;
}

(async () => {
  const { email, password, name, carnet, force, help } = parseArgs();
  if (help || !email || !password) {
    console.log('Usage: node scripts/create-admin.js -e <email> -p <password> [-n "Full Name"] [-c CARNET] [--force]');
    process.exit(help ? 0 : 1);
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const fullName = String(name || 'Administrador').trim();
  const role = 'admin';

  try {
    // Ensure table exists if using loose environment
    await db.query(`CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT,
      carnet_number VARCHAR(64),
      role TEXT NOT NULL DEFAULT 'user',
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      has_used_unenrollment BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  } catch (e) {
    // ignore; in proper env table exists
  }

  const hashed = await bcrypt.hash(password, 10);

  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (rows.length > 0 && !force) {
      console.log(`User already exists: ${normalizedEmail}. Use --force to update its role/password.`);
      process.exit(0);
    }

    if (rows.length > 0 && force) {
      const { rows: upd } = await db.query(
        'UPDATE users SET full_name=$1, password=$2, carnet_number=$3, role=$4, is_verified=true, updated_at=NOW() WHERE id=$5 RETURNING id, email, role, full_name',
        [fullName, hashed, carnet || null, role, rows[0].id]
      );
      console.log('Admin updated:', upd[0]);
      process.exit(0);
    }

    const { rows: ins } = await db.query(
      'INSERT INTO users (email, password, full_name, carnet_number, role, is_verified, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,true, NOW(), NOW()) RETURNING id, email, role, full_name',
      [normalizedEmail, hashed, fullName, carnet || null, role]
    );
    console.log('Admin created:', ins[0]);
    process.exit(0);
  } catch (err) {
    console.error('Failed to create admin:', err.message || err);
    process.exit(1);
  }
})();
