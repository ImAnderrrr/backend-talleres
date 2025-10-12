const db = require('../db');

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
