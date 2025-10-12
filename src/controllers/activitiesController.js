const db = require('../db');

exports.listActivities = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const all = req.query.all === 'true' || req.query.all === '1';
    const sinceMinutes = req.query.since ? parseInt(req.query.since, 10) : null; // minutes

    let sql, params;
    if (all) {
      sql = 'SELECT al.*, u.full_name AS actor_name FROM activity_logs al LEFT JOIN users u ON (u.id::text = al.actor_id) ORDER BY al.created_at DESC LIMIT $1';
      params = [limit];
    } else if (sinceMinutes && Number.isFinite(sinceMinutes)) {
      sql = "SELECT al.*, u.full_name AS actor_name FROM activity_logs al LEFT JOIN users u ON (u.id::text = al.actor_id) WHERE al.created_at >= NOW() - ($1::interval) ORDER BY al.created_at DESC LIMIT $2";
      params = [`${sinceMinutes} minutes`, limit];
    } else {
      // default: last 24 hours
      sql = "SELECT al.*, u.full_name AS actor_name FROM activity_logs al LEFT JOIN users u ON (u.id::text = al.actor_id) WHERE al.created_at >= NOW() - ($1::interval) ORDER BY al.created_at DESC LIMIT $2";
      params = ['24 hours', limit];
    }

    const result = await db.query(sql, params);
    return res.json(result.rows.map(r => ({
      id: r.id,
      actorEmail: r.actor_email,
      actorId: r.actor_id,
      actorName: r.actor_name,
      type: r.type,
      payload: r.payload,
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error('Error listing activities:', err);
    return res.status(500).json({ message: 'Ocurrió un error listando actividades.' });
  }
};

exports.createActivity = async ({ actorEmail, actorId, type, payload }) => {
  try {
    const insertSql = `INSERT INTO activity_logs (actor_email, actor_id, type, payload, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *`;
    // Normalize actorId to string for TEXT column (accepts uuid, int, etc.)
    const actorIdText = actorId == null ? null : String(actorId);
    const result = await db.query(insertSql, [actorEmail || null, actorIdText, type, payload || null]);
    return result.rows[0];
  } catch (err) {
    console.error('Error creating activity:', err && err.stack ? err.stack : err);
    // Non-fatal for main flows; return null on error
    return null;
  }
};
