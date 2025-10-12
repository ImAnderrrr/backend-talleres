#!/usr/bin/env node
// List workshops (basic diagnostic)
require('dotenv').config({ path: require('path').join(__dirname,'..','.env') })
const { Client } = require('pg')
;(async () => {
  const client = new Client({
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    database: process.env.PGDATABASE || 'postgres',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || ''
  })
  try {
    await client.connect()
    const res = await client.query("SELECT id, title, enrolled, capacity, status, created_at FROM workshops ORDER BY created_at DESC LIMIT 50")
    if (!res.rows.length) console.log('No workshops in DB.')
    else console.table(res.rows)
  } catch (e) {
    console.error('Error listing workshops:', e.message)
  } finally {
    await client.end()
  }
})()
