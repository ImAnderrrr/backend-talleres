const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/authRoutes');
const banksRoutes = require('./routes/banksRoutes');
const depositsRoutes = require('./routes/depositsRoutes');
const workshopsRoutes = require('./routes/workshopsRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const adminRoutes = require('./routes/adminRoutes');
const activitiesRoutes = require('./routes/activitiesRoutes');

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const app = express();

// Ensure activity_logs table exists on startup (best-effort)
const db = require('./db');
(async () => {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS activity_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_email TEXT NULL,
      actor_id TEXT NULL,
      type TEXT NOT NULL,
      payload JSONB NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );`);
    await db.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs (created_at DESC);');
    // Normalize actor_id column type to TEXT in case older schema created it as UUID
    try {
      const col = await db.query("SELECT udt_name FROM information_schema.columns WHERE table_name='activity_logs' AND column_name='actor_id'");
      const udt = (col.rows[0] && col.rows[0].udt_name || '').toLowerCase();
      if (udt && udt !== 'text') {
        await db.query('ALTER TABLE activity_logs ALTER COLUMN actor_id TYPE TEXT USING actor_id::text;');
        console.log('Normalized activity_logs.actor_id column to TEXT');
      }
    } catch (normErr) {
      console.warn('Could not normalize activity_logs.actor_id to TEXT:', normErr && normErr.message ? normErr.message : normErr);
    }
    console.log('Ensured activity_logs table exists');
  } catch (e) {
    console.warn('Could not ensure activity_logs table:', e && e.message ? e.message : e);
  }
})();

// Ensure unique carnet index (case- and hyphen-insensitive) on users.carnet_number
(async () => {
  try {
    await db.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS users_carnet_unique_key ON users ((REPLACE(UPPER(carnet_number), '-', ''))) WHERE carnet_number IS NOT NULL AND carnet_number <> ''"
    );
    console.log('Ensured unique index users_carnet_unique_key on users.carnet_number');
  } catch (e) {
    console.warn('Could not ensure unique carnet index (you may have duplicates already):', e && e.message ? e.message : e);
  }
})();

// Ensure users.has_used_unenrollment column exists (one-time unenrollment policy)
(async () => {
  try {
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS has_used_unenrollment BOOLEAN NOT NULL DEFAULT FALSE;");
    console.log('Ensured users.has_used_unenrollment column exists');
  } catch (e) {
    console.warn('Could not ensure users.has_used_unenrollment column:', e && e.message ? e.message : e);
  }
})();

// Ensure users.avatar_url column exists to store profile pictures
(async () => {
  try {
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL;");
    console.log('Ensured users.avatar_url column exists');
  } catch (e) {
    console.warn('Could not ensure users.avatar_url column:', e && e.message ? e.message : e);
  }
})();

// Ensure deposits soft-delete columns exist
(async () => {
  try {
    await db.query("ALTER TABLE deposits ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;");
    await db.query("ALTER TABLE deposits ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;");
    await db.query("ALTER TABLE deposits ADD COLUMN IF NOT EXISTS owner_deleted BOOLEAN NOT NULL DEFAULT FALSE;");
    console.log('Ensured deposits soft-delete columns exist');
  } catch (e) {
    console.warn('Could not ensure deposits soft-delete columns:', e && e.message ? e.message : e);
  }
})();

// Ensure workshop_enrollments table exists (best-effort, adaptive to existing users.id type)
(async () => {
  try {
    // Skip if already exists
    const existing = await db.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'workshop_enrollments' LIMIT 1");
    if (existing.rowCount > 0) {
      return console.log('workshop_enrollments table already present');
    }

    // Determine users table & id type
    const usersTable = await db.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'users' LIMIT 1");
    if (usersTable.rowCount === 0) {
      console.warn('Users table not found. Cannot create workshop_enrollments (will retry on next start).');
      return;
    }
    const idTypeRes = await db.query("SELECT data_type, udt_name FROM information_schema.columns WHERE table_name='users' AND column_name='id'");
    const idCol = idTypeRes.rows[0];
    if (!idCol) {
      console.warn('users.id column not found. Aborting workshop_enrollments creation.');
      return;
    }
    // Map Postgres types to DDL snippet
    let userIdType = 'UUID';
    const normalized = (idCol.udt_name || idCol.data_type || '').toLowerCase();
    if (['int4','integer','serial'].includes(normalized)) userIdType = 'INTEGER';
    else if (['int8','bigint','bigserial'].includes(normalized)) userIdType = 'BIGINT';
    else if (['uuid'].includes(normalized)) userIdType = 'UUID';
    else {
      // Fallback: use same domain type
      userIdType = idCol.udt_name.toUpperCase();
    }

    try { await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;'); } catch (_) {}

    const ddl = `CREATE TABLE IF NOT EXISTS workshop_enrollments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workshop_id VARCHAR(100) NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
      user_id ${userIdType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_email VARCHAR(255) NOT NULL,
      student_full_name VARCHAR(255),
      carnet_number VARCHAR(64),
      payment_status VARCHAR(20) NOT NULL DEFAULT 'approved',
      attended BOOLEAN NOT NULL DEFAULT FALSE,
      enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (workshop_id, user_id)
    );`;
    await db.query(ddl);
    await db.query('CREATE INDEX IF NOT EXISTS idx_workshop_enrollments_workshop ON workshop_enrollments(workshop_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_workshop_enrollments_user ON workshop_enrollments(user_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_workshop_enrollments_payment_status ON workshop_enrollments(payment_status);');
    console.log('Ensured workshop_enrollments table exists (user_id type: ' + userIdType + ')');
  } catch (e) {
    console.warn('Could not ensure workshop_enrollments table:', e && e.message ? e.message : e);
  }
})();

app.use(cors({
  origin: process.env.CLIENT_ORIGIN?.split(',').map((origin) => origin.trim()) || '*',
  credentials: true,
}));
app.use(express.json());
// cookie parser to read httpOnly cookies
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// Use centralized upload middleware dir for static serving
const { uploadsDir } = require('./middleware/upload')
app.use('/uploads', express.static(uploadsDir))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/banks', banksRoutes);
app.use('/deposits', depositsRoutes);
app.use('/workshops', workshopsRoutes);
app.use('/uploads', uploadRoutes);
app.use('/activities', activitiesRoutes);
app.use('/admin', adminRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log('Backend listening on port ' + PORT);
});
