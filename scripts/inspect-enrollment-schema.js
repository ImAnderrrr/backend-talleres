#!/usr/bin/env node
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
    const usersCols = await client.query("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position")
    const enrollCols = await client.query("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name='workshop_enrollments' ORDER BY ordinal_position")
    console.log('\nUsers table columns:')
    console.table(usersCols.rows)
    console.log('\nWorkshop_enrollments columns:')
    console.table(enrollCols.rows)

    const userId = usersCols.rows.find(r => r.column_name==='id')
    const enrollUserId = enrollCols.rows.find(r => r.column_name==='user_id')
    if (userId && enrollUserId) {
      const uType = (userId.udt_name||userId.data_type).toLowerCase()
      const eType = (enrollUserId.udt_name||enrollUserId.data_type).toLowerCase()
      if (uType!==eType) {
        console.log(`\nType mismatch detected: users.id = ${uType}, workshop_enrollments.user_id = ${eType}`)
        console.log('If table is empty you can fix with:')
        console.log(`  ALTER TABLE workshop_enrollments DROP CONSTRAINT IF EXISTS workshop_enrollments_user_id_fkey;`)
        console.log(`  ALTER TABLE workshop_enrollments ALTER COLUMN user_id TYPE ${uType.toUpperCase()} USING user_id::${uType};`)
        console.log(`  ALTER TABLE workshop_enrollments ADD CONSTRAINT workshop_enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;`)
      } else {
        console.log('\nuser_id type matches users.id (OK)')
      }
    }
  } catch (e) {
    console.error('Error inspecting schema:', e.message)
  } finally {
    await client.end()
  }
})()
