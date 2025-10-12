#!/usr/bin/env node
// Force-remove a workshop enrollment for a user (maintenance/admin tool)
// Usage examples:
//   node scripts/force-unenroll.js --email="user@miumg.edu.gt" --workshopId=123
//   node scripts/force-unenroll.js --userId=42 --workshopId=123 --reset-unenroll-flag

const path = require('path')
const { pool, query } = require('../src/db')

function parseArgs(argv) {
  const args = {}
  for (const a of argv.slice(2)) {
    const [k, v] = a.includes('=') ? a.split('=') : [a, true]
    const key = k.replace(/^--?/, '')
    args[key] = v === true ? true : v
  }
  return args
}

const DEFAULTS = {
  email: 'kmendezl5@miumg.edu.gt',
  workshopId: 'WORK-202510-795725'
}

async function main() {
  const args = parseArgs(process.argv)
  const { email: emailArg, userId: userIdArg, workshopId: workshopIdArg } = args
  const resetFlag = !!(args['reset-unenroll-flag'] || args.resetUnenrollFlag)

  const email = emailArg || DEFAULTS.email
  const effectiveWorkshopId = workshopIdArg || DEFAULTS.workshopId

  if (!email && !userIdArg) {
    console.error('Error: Provide --email or --userId')
    process.exit(1)
  }
  if (!effectiveWorkshopId) {
    console.error('Error: Provide --workshopId')
    process.exit(1)
  }

  const workshopId = String(effectiveWorkshopId)
  let userId = userIdArg ? Number(userIdArg) : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (!userId) {
      const ures = await client.query('SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [String(email)])
      if (!ures.rows[0]) {
        await client.query('ROLLBACK')
        console.error(`User not found for email: ${email}`)
        process.exit(1)
      }
      userId = Number(ures.rows[0].id)
    }

    // Lock target workshop (if exists) for safe decrement
    const wres = await client.query('SELECT id, enrolled FROM workshops WHERE id = $1 FOR UPDATE', [workshopId])
    if (!wres.rows[0]) {
      await client.query('ROLLBACK')
      console.error(`Workshop not found: ${workshopId}`)
      process.exit(1)
    }

    // Locate enrollment
    const enrRes = await client.query('SELECT id FROM workshop_enrollments WHERE workshop_id = $1 AND user_id = $2 FOR UPDATE', [workshopId, userId])
    const enr = enrRes.rows[0]
    if (!enr) {
      await client.query('ROLLBACK')
      console.error(`Enrollment not found for userId=${userId} in workshopId=${workshopId}`)
      process.exit(2)
    }

    await client.query('DELETE FROM workshop_enrollments WHERE id = $1', [enr.id])
    await client.query('UPDATE workshops SET enrolled = GREATEST(enrolled - 1, 0), updated_at = NOW() WHERE id = $1', [workshopId])

    if (resetFlag) {
      await client.query('UPDATE users SET has_used_unenrollment = FALSE WHERE id = $1', [userId])
    }

    await client.query('COMMIT')

    console.log(`Force unenrolled userId=${userId} from workshopId=${workshopId}${resetFlag ? ' (reset unenroll flag)' : ''}`)
    process.exit(0)
  } catch (err) {
    try { await client.query('ROLLBACK') } catch {}
    console.error('Failed to force unenroll:', err && err.message ? err.message : err)
    process.exit(1)
  } finally {
    client.release()
  }
}

main()
