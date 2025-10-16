const db = require('../db');

function mapEnrollment(row) {
  return {
    id: row.id,
    workshopId: row.workshop_id,
    userId: row.user_id,
    email: row.user_email,
    studentName: row.student_full_name,
    carnetNumber: row.carnet_number,
    paymentStatus: row.payment_status,
    attended: row.attended,
    enrolledAt: row.enrolled_at
  };
}

exports.enrollInWorkshop = async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: 'No autenticado' });
  const workshopId = req.params.id;

  try {
    await db.query('BEGIN');

    // Lock workshop row
    const wsRes = await db.query('SELECT id, capacity, enrolled, status FROM workshops WHERE id = $1 FOR UPDATE', [workshopId]);
    const ws = wsRes.rows[0];
    if (!ws) { await db.query('ROLLBACK'); return res.status(404).json({ message: 'Taller no encontrado' }); }
    // Optional: only allow published/active statuses
    if (ws.status && ws.status !== 'published' && ws.status !== 'active') {
      await db.query('ROLLBACK');
      return res.status(400).json({ message: 'Este taller no admite inscripciones actualmente.' });
    }

    // Already enrolled in this workshop?
    const exists = await db.query('SELECT 1 FROM workshop_enrollments WHERE workshop_id = $1 AND user_id = $2', [workshopId, user.id]);
    if (exists.rows[0]) { await db.query('ROLLBACK'); return res.status(409).json({ message: 'Ya estás inscrito en este taller.' }); }

    // Enforce max concurrent enrollments per user (approved)
    const rawMax = parseInt(String(process.env.MAX_CONCURRENT_ENROLLMENTS || process.env.MAX_WORKSHOPS_PER_STUDENT || '1'), 10);
    const maxConcurrent = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 1;
    if (maxConcurrent > 0) {
      const cntRes = await db.query(
        `SELECT COUNT(*) AS c FROM workshop_enrollments WHERE user_id = $1 AND payment_status = 'approved'`,
        [user.id]
      );
      const currentCount = Number(cntRes.rows[0]?.c || 0);
      if (currentCount >= maxConcurrent) {
        await db.query('ROLLBACK');
        return res.status(400).json({ message: `Has alcanzado el límite de ${maxConcurrent} taller(es) inscritos simultáneamente.` });
      }
    }

    if (ws.capacity && ws.enrolled >= ws.capacity) {
      await db.query('ROLLBACK');
      return res.status(400).json({ message: 'Cupos completos.' });
    }

    // Enrich user info (full name, carnet)
    const uRes = await db.query('SELECT full_name, carnet_number, email FROM users WHERE id = $1', [user.id]);
    const u = uRes.rows[0] || {};

    const insRes = await db.query(
      `INSERT INTO workshop_enrollments (workshop_id, user_id, user_email, student_full_name, carnet_number, payment_status)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [workshopId, user.id, u.email || user.email, u.full_name || null, u.carnet_number || null, 'approved']
    );

    await db.query('UPDATE workshops SET enrolled = enrolled + 1, updated_at = NOW() WHERE id = $1', [workshopId]);

    await db.query('COMMIT');

    // Side-effects (non-blocking): activity log (email removed by request)
    ;(async () => {
      try {
  const { createActivity } = require('./activitiesController');
  createActivity({ actorEmail: u.email || user.email, actorId: user.id, type: 'workshop.enroll', payload: { workshopId, studentName: (u.full_name && String(u.full_name).trim()) || null } });
      } catch (_) {}
    })();

    return res.status(201).json({ enrollment: mapEnrollment(insRes.rows[0]) });
  } catch (err) {
    console.error('Error enrolling in workshop:', err);
    try { await db.query('ROLLBACK'); } catch {}
    return res.status(500).json({ message: 'Error al inscribirse.' });
  }
};

exports.getMyEnrollment = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'No autenticado' });
  const workshopId = req.params.id;
  try {
    const enr = await db.query('SELECT * FROM workshop_enrollments WHERE workshop_id = $1 AND user_id = $2 LIMIT 1', [workshopId, req.user.id]);
    if (!enr.rows[0]) return res.json({ enrolled: false });
    return res.json({ enrolled: true, enrollment: mapEnrollment(enr.rows[0]) });
  } catch (err) {
    console.error('Error getting enrollment:', err);
    return res.status(500).json({ message: 'Error' });
  }
};

exports.listEnrollmentsForWorkshop = async (req, res) => {
  // requireAdmin middleware should run before
  const workshopId = req.params.id;
  const { status, search } = req.query;
  try {
    const params = [workshopId];
    const where = ['workshop_id = $1'];
    let idx = 2;
    if (status) { where.push(`payment_status = $${idx++}`); params.push(status); }
    if (search) {
      where.push(`(LOWER(student_full_name) LIKE $${idx} OR LOWER(user_email) LIKE $${idx} OR carnet_number LIKE $${idx})`);
      params.push(`%${String(search).toLowerCase()}%`);
      idx++;
    }
    const sql = `SELECT * FROM workshop_enrollments WHERE ${where.join(' AND ')} ORDER BY enrolled_at DESC`;
    const { rows } = await db.query(sql, params);

    // Stats quick query
    const statRes = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE payment_status = 'approved') AS approved,
         COUNT(*) FILTER (WHERE payment_status = 'pending') AS pending,
         COUNT(*) AS total
       FROM workshop_enrollments WHERE workshop_id = $1`, [workshopId]
    );
    const stats = statRes.rows[0];
    return res.json({
      workshopId,
      total: Number(stats.total || 0),
      approved: Number(stats.approved || 0),
      pending: Number(stats.pending || 0),
      data: rows.map(mapEnrollment)
    });
  } catch (err) {
    console.error('Error listing enrollments:', err);
    return res.status(500).json({ message: 'Error listando inscripciones.' });
  }
};

// Allow a user to unenroll exactly once across all workshops.
// After the first successful unenrollment, further attempts are rejected.
exports.unenrollFromWorkshop = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'No autenticado' });
  const workshopId = req.params.id;
  const userId = req.user.id;
  try {
    await db.query('BEGIN');

    // Check one-time unenrollment policy
    const policyRes = await db.query('SELECT has_used_unenrollment FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const policy = policyRes.rows[0];
    if (!policy) { await db.query('ROLLBACK'); return res.status(404).json({ message: 'Usuario no encontrado' }); }
    if (policy.has_used_unenrollment) {
      await db.query('ROLLBACK');
      return res.status(403).json({ message: 'Ya utilizaste tu única oportunidad de desinscripción.' });
    }

    // Lock workshop row and ensure enrollment exists
    const wsRes = await db.query('SELECT id, enrolled FROM workshops WHERE id = $1 FOR UPDATE', [workshopId]);
    const ws = wsRes.rows[0];
    if (!ws) { await db.query('ROLLBACK'); return res.status(404).json({ message: 'Taller no encontrado' }); }

    const enrRes = await db.query('SELECT id FROM workshop_enrollments WHERE workshop_id = $1 AND user_id = $2 FOR UPDATE', [workshopId, userId]);
    const enr = enrRes.rows[0];
    if (!enr) { await db.query('ROLLBACK'); return res.status(404).json({ message: 'No estás inscrito en este taller' }); }

    // Perform unenrollment and mark policy usage
    await db.query('DELETE FROM workshop_enrollments WHERE id = $1', [enr.id]);
    await db.query('UPDATE workshops SET enrolled = GREATEST(enrolled - 1, 0), updated_at = NOW() WHERE id = $1', [workshopId]);
    await db.query('UPDATE users SET has_used_unenrollment = TRUE WHERE id = $1', [userId]);

    await db.query('COMMIT');

    // Activity log (non-blocking)
    try {
      const { createActivity } = require('./activitiesController');
      // Best-effort: fetch name for nicer activity text
      let studentName = null;
      try {
        const nres = await db.query('SELECT full_name FROM users WHERE id = $1', [userId]);
        studentName = (nres.rows[0] && nres.rows[0].full_name) ? String(nres.rows[0].full_name).trim() : null;
      } catch {}
      createActivity({ actorEmail: req.user.email, actorId: userId, type: 'workshop.unenroll', payload: { workshopId, studentName } });
    } catch (_) {}

    return res.json({ message: 'Desinscripción completada. Esta acción solo puede realizarse una vez.' });
  } catch (err) {
    console.error('Error unenrolling from workshop:', err);
    try { await db.query('ROLLBACK'); } catch {}
    return res.status(500).json({ message: 'Error al desinscribirse.' });
  }
};

// Summary for current user: list of enrolled workshop IDs (approved) and max concurrent limit
exports.listMyEnrollmentsSummary = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'No autenticado' });
    const userId = req.user.id;
    const { rows } = await db.query(
      `SELECT workshop_id FROM workshop_enrollments
        WHERE user_id = $1 AND payment_status = 'approved' 
        ORDER BY enrolled_at DESC`,
      [userId]
    );
    const workshopIds = rows.map(r => String(r.workshop_id));
    const rawMax = parseInt(String(process.env.MAX_CONCURRENT_ENROLLMENTS || process.env.MAX_WORKSHOPS_PER_STUDENT || '1'), 10);
    const maxConcurrentEnrollments = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 1;
    return res.json({
      count: workshopIds.length,
      workshopIds,
      maxConcurrentEnrollments,
    });
  } catch (err) {
    console.error('Error getting my enrollments summary:', err);
    return res.status(500).json({ message: 'Error obteniendo inscripciones.' });
  }
};
