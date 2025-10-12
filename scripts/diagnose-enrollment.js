#!/usr/bin/env node
// Diagnose why an enrollment might not persist.
require('dotenv').config({ path: require('path').join(__dirname,'..','.env') })
const { Client } = require('pg')

async function main() {
  const workshopId = process.argv[2]
  if (!workshopId) {
    console.error('Usage: node scripts/diagnose-enrollment.js WORKSHOP_ID')
    process.exit(1)
  }
  const client = new Client({
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    database: process.env.PGDATABASE || 'postgres',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || ''
  })
  try {
    await client.connect()

    // 1. Confirm workshop exists
    const ws = await client.query('SELECT id, enrolled, capacity, status FROM workshops WHERE id = $1', [workshopId])
    if (!ws.rows[0]) {
      console.log('WORKSHOP NOT FOUND in DB -> ID may differ from frontend cached ID')
      return
    }
    console.table(ws.rows)

    // 2. Count enrollments actually stored
    const count = await client.query('SELECT COUNT(*)::int AS total FROM workshop_enrollments WHERE workshop_id = $1', [workshopId])
    console.log('Persisted enrollments count:', count.rows[0].total)

    // 3. Show last 5 enrollments for that workshop
    const last = await client.query(`SELECT id, user_id, user_email, enrolled_at FROM workshop_enrollments WHERE workshop_id=$1 ORDER BY enrolled_at DESC LIMIT 5`, [workshopId])
    if (!last.rows.length) console.log('No enrollment rows for this workshop yet.')
    else console.table(last.rows)

    // 4. Show any recent activity log events for enrollment
    const acts = await client.query(`SELECT id, type, actor_email, created_at FROM activity_logs WHERE type='workshop.enroll' ORDER BY created_at DESC LIMIT 10`)
    if (!acts.rows.length) console.log('No activity log events of type workshop.enroll (maybe controller did not reach log or no enrolls).')
    else console.table(acts.rows)

  } catch (e) {
    console.error('Diagnostic error:', e.message)
  } finally {
    await client.end()
  }
}

main()
