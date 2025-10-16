const db = require('../db');
const bcrypt = require('bcryptjs');
const { validateCarnetFormat, normalizeCarnet, carnetKey } = require('../utils/carnet');

// GET /admin/stats - basic KPIs for the admin dashboard
// Returns:
// {
//   totalStudents: number,          // users with role 'user' or 'student'
//   activeWorkshops: number,        // workshops with status 'published' or 'active'
//   pendingDeposits: number,        // deposits not yet reviewed: status in ('review','pending','pendiente'), no reviewed_by/review_date, not soft-deleted
//   maxConcurrentEnrollments: number // maximum workshops a student can be enrolled in concurrently (from .env)
// }
exports.getDashboardStats = async (_req, res) => {
  try {
    const [studentsRes, workshopsRes, depositsRes, newStudentsRes] = await Promise.all([
      db.query("SELECT COUNT(*)::int AS count FROM users WHERE lower(trim(role)) IN ('user','student','alumno','estudiante')"),
      db.query("SELECT COUNT(*)::int AS count FROM workshops WHERE lower(trim(status)) IN ('published','active','publicado','activo')"),
      db.query(
        `SELECT COUNT(*)::int AS count
           FROM deposits
          WHERE (is_deleted IS NULL OR is_deleted = FALSE)
            AND (reviewed_by IS NULL AND review_date IS NULL)
            AND lower(trim(status)) IN ('review','pending','pendiente')`
      ),
      db.query(
        `SELECT COUNT(*)::int AS count
           FROM users
          WHERE lower(trim(role)) IN ('user','student','alumno','estudiante')
            AND date_trunc('month', created_at) = date_trunc('month', now())`
      ),
    ]);

    // Read max concurrent enrollments from environment (fallback to 1)
    const rawMax = parseInt(String(process.env.MAX_CONCURRENT_ENROLLMENTS || process.env.MAX_WORKSHOPS_PER_STUDENT || '1'), 10);
    const maxConcurrentEnrollments = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 1;

    return res.json({
      totalStudents: studentsRes.rows[0]?.count || 0,
      activeWorkshops: workshopsRes.rows[0]?.count || 0,
      pendingDeposits: depositsRes.rows[0]?.count || 0,
      newStudentsThisMonth: newStudentsRes.rows[0]?.count || 0,
      maxConcurrentEnrollments,
    });
  } catch (err) {
    console.error('Error getting admin dashboard stats:', err);
    return res.status(500).json({ message: 'Ocurrió un error obteniendo estadísticas.' });
  }
};

// GET /admin/users/:id - details for a user including their current approved enrollments
exports.getUserDetails = async (req, res) => {
  const userId = req.params.id;
  try {
    const ures = await db.query(
      `SELECT id, full_name AS "fullName", email, carnet_number AS "carnetNumber", role FROM users WHERE id = $1`,
      [userId]
    );
    const user = ures.rows[0];
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const { rows: enr } = await db.query(
      `SELECT e.id, e.workshop_id AS "workshopId", w.title, to_char(w.date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, w.time, w.location, w.image AS image
         FROM workshop_enrollments e
         JOIN workshops w ON w.id = e.workshop_id
        WHERE e.user_id = $1 AND e.payment_status = 'approved'
        ORDER BY e.enrolled_at DESC`,
      [userId]
    );

    const rawMax = parseInt(String(process.env.MAX_CONCURRENT_ENROLLMENTS || process.env.MAX_WORKSHOPS_PER_STUDENT || '1'), 10);
    const maxConcurrentEnrollments = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 1;
    const currentApprovedCount = enr.length;
    const remaining = Math.max(0, maxConcurrentEnrollments - currentApprovedCount);

    return res.json({
      ...user,
      enrollments: enr,
      maxConcurrentEnrollments,
      currentApprovedCount,
      remaining,
    });
  } catch (err) {
    console.error('Error getting user details:', err);
    return res.status(500).json({ message: 'No se pudo obtener el detalle del usuario.' });
  }
};

// DELETE /admin/users/:id/workshops/:workshopId - admin removes a user's enrollment (bypasses user self-unenroll policy)
exports.adminUnenrollUserFromWorkshop = async (req, res) => {
  const userId = req.params.id;
  const workshopId = req.params.workshopId;
  try {
    await db.query('BEGIN');

    const eRes = await db.query(
      'SELECT id FROM workshop_enrollments WHERE user_id = $1 AND workshop_id = $2 FOR UPDATE',
      [userId, workshopId]
    );
    const enrollment = eRes.rows[0];
    if (!enrollment) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'El usuario no está inscrito en este taller.' });
    }

    await db.query('DELETE FROM workshop_enrollments WHERE id = $1', [enrollment.id]);
    await db.query('UPDATE workshops SET enrolled = GREATEST(enrolled - 1, 0), updated_at = NOW() WHERE id = $1', [workshopId]);

    await db.query('COMMIT');

    // Log activity (best-effort). Actor must be the admin performing the action.
    try {
      const { createActivity } = require('./activitiesController');
      const adminId = (req.user && req.user.id) ? String(req.user.id) : null;
      const adminEmail = (req.user && req.user.email) ? req.user.email : null;
      // fetch student name for payload
      let studentName = null;
      try {
        const sRes = await db.query('SELECT full_name FROM users WHERE id = $1', [userId]);
        studentName = sRes.rows[0]?.full_name ? String(sRes.rows[0].full_name).trim() : null;
      } catch {}
      createActivity({ actorEmail: adminEmail, actorId: adminId, type: 'admin.unenroll', payload: { workshopId, studentId: String(userId), studentName } });
    } catch (_) {}

    return res.json({ message: 'Inscripción eliminada correctamente.' });
  } catch (err) {
    console.error('Error admin unenrolling user:', err);
    try { await db.query('ROLLBACK'); } catch {}
    return res.status(500).json({ message: 'No se pudo eliminar la inscripción.' });
  }
};

// GET /admin/users - list of registered users for admin
// Returns array of { id, fullName, carnetNumber, email }
exports.getUsersList = async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, full_name AS "fullName", carnet_number AS "carnetNumber", email
         FROM users
        ORDER BY created_at DESC NULLS LAST, id DESC`
    );
    return res.json(rows || []);
  } catch (err) {
    console.error('Error getting users list:', err);
    // Fallback simple query if some columns don't exist
    try {
      const { rows } = await db.query(
        `SELECT id, full_name AS "fullName", email FROM users ORDER BY id DESC`
      );
      return res.json(rows || []);
    } catch (e2) {
      console.error('Fallback users list failed:', e2);
      return res.status(500).json({ message: 'No se pudo obtener la lista de usuarios' });
    }
  }
};

// POST /admin/users - create a user (admin or student) by an administrator
// Body: { fullName, email, password, role: 'admin'|'student', carnetNumber? }
exports.createUser = async (req, res) => {
  try {
    const { fullName, email, password, role, carnetNumber } = req.body || {};

    const normEmail = String(email || '').trim().toLowerCase();
    const normFull = String(fullName || '').trim();
    const normRole = String(role || '').trim().toLowerCase();
    const normCarnet = carnetNumber ? String(carnetNumber).trim() : null;

    if (!normFull || !normEmail || !password || !(normRole === 'admin' || normRole === 'student')) {
      return res.status(400).json({ message: 'Campos inválidos. Revisa nombre, correo, contraseña y rol.' });
    }

    // Require institutional email for consistency
    if (!/@miumg\.edu\.gt$/i.test(normEmail)) {
      return res.status(400).json({ message: 'El correo debe ser institucional (@miumg.edu.gt).' });
    }

    // Carnet rules for students: required, format, uniqueness
    if (normRole === 'student') {
      if (!normCarnet) {
        return res.status(400).json({ message: 'El carné es obligatorio para estudiantes.' });
      }
      const fmt = validateCarnetFormat(normCarnet);
      if (!fmt.valid) {
        return res.status(400).json({ message: fmt.message || 'Carné inválido.' });
      }
      const uniqueKey = carnetKey(normCarnet);
      try {
        const { rows: dupCarnet } = await db.query(
          "SELECT 1 FROM users WHERE REPLACE(UPPER(carnet_number), '-', '') = $1 LIMIT 1",
          [uniqueKey]
        );
        if (dupCarnet.length > 0) {
          return res.status(409).json({ message: 'Este carné ya ha sido registrado.' });
        }
      } catch (e) {
        // if column missing in some environments, skip uniqueness (DB schema should include it)
      }
    }

    // Email uniqueness
    const { rows: dupEmail } = await db.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [normEmail]);
    if (dupEmail.length > 0) {
      return res.status(409).json({ message: 'Este correo ya está registrado.' });
    }

    const hashed = await bcrypt.hash(String(password), 10);

    // Map role to DB representation
    const dbRole = normRole === 'admin' ? 'admin' : 'user';

    const carnetForInsert = normRole === 'student' ? normalizeCarnet(normCarnet) : '';
    const { rows } = await db.query(
      `INSERT INTO users (full_name, email, password, carnet_number, role, is_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       RETURNING id, full_name AS "fullName", carnet_number AS "carnetNumber", email, role`,
      [normFull, normEmail, hashed, carnetForInsert, dbRole]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    // Handle potential unique index on carnet
    const msg = err && err.message ? String(err.message) : '';
    if (/unique|duplicate/i.test(msg)) {
      return res.status(409).json({ message: 'El carné o correo ya está registrado.' });
    }
    console.error('Error creating user by admin:', err);
    return res.status(500).json({ message: 'No se pudo crear el usuario.' });
  }
};
