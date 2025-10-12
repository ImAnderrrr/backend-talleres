const db = require('../db');
const activities = require('./activitiesController');

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    bankId: row.bank_id,
    bankName: row.bank_name,
    bankAccountNumber: row.bank_account_number,
    bankAccountHolder: row.bank_account_holder,
    bankColor: row.bank_color,
    documentNumber: row.document_number,
    fullName: row.full_name,
    email: row.email,
    fileName: row.file_name,
    fileSize: row.file_size,
    fileMime: row.file_mime,
    filePath: row.file_path,
    status: row.status,
    createdAt: row.created_at,
    amount: row.amount,
    referenceNumber: row.reference_number,
    carnetNumber: row.carnet_number,
    reviewedBy: row.reviewed_by,
    reviewNotes: row.review_notes,
    reviewDate: row.review_date,
    // backward-compatible fields expected by frontend
    rejectionReason: row.review_notes || null,
    rejection_reason: row.review_notes || null,
  };
}

exports.createDeposit = async (req, res) => {
  try {
    const body = req.body || {};
    // Prefer authenticated user id/email if available
    const userId = (req.user && (req.user.id || req.user.email)) || body.userId || body.user_id || body.email || null;
    const bankId = body.bankId || body.bank_id;
    // allow filling missing personal fields from authenticated user profile
    let documentNumber = body.documentNumber || body.document_number || null;
    let fullName = body.fullName || body.full_name || null;
    let email = body.email || null;
    let carnetNumber = body.carnetNumber || body.carnet_number || null;

  // If some identifying fields are missing, try to enrich from users table when request is authenticated
  if (req.user && (req.user.id || req.user.email)) {
      try {
        let userProfileRes;
        if (req.user.id) {
          userProfileRes = await db.query('SELECT carnet_number, full_name, email FROM users WHERE id = $1', [req.user.id]);
        } else {
          userProfileRes = await db.query('SELECT carnet_number, full_name, email FROM users WHERE lower(email) = lower($1)', [req.user.email]);
        }
        const userProfile = userProfileRes.rows[0];
        if (userProfile) {
          if (!carnetNumber && userProfile.carnet_number) carnetNumber = userProfile.carnet_number;
          if (!fullName && userProfile.full_name) fullName = userProfile.full_name;
          if (!email && userProfile.email) email = userProfile.email;
        }
      } catch (e) {
        console.warn('Could not enrich deposit from user profile:', e && e.message ? e.message : e);
      }
    }

    // If a file was uploaded via multipart, multer exposes it on req.file
    let fileName = null;
    let fileSize = null;
    let fileMime = null;
    let filePath = null;
    if (req.file) {
      fileName = req.file.filename || req.file.originalname
      fileSize = req.file.size || null
      fileMime = req.file.mimetype || null
      filePath = req.file.path || null
    } else {
      fileName = body.fileName || null;
      fileSize = body.fileSize ? parseInt(body.fileSize, 10) : null;
      fileMime = body.fileMime || null;
      filePath = body.filePath || null;
    }

    if (!bankId || !documentNumber || !fullName || !email) {
      // If the request is not authenticated, require the client to include identifying fields
      if (!req.user) {
        return res.status(400).json({
          message: 'Autenticación requerida o datos incompletos. Inicia sesión para que podamos usar tu perfil, o envía fullName, email y documentNumber en el body.'
        });
      }
      return res.status(400).json({ message: 'bankId, documentNumber, fullName y email son obligatorios.' });
    }

    const insertSql = `INSERT INTO deposits (user_id, bank_id, bank_name, bank_account_number, bank_account_holder, bank_color, document_number, full_name, email, file_name, file_size, file_mime, file_path, amount, reference_number, carnet_number, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW()) RETURNING *`;

    // default status: review
    const status = 'review';
  // bank snapshot fields can be provided by the client
  const bankName = body.bankName || body.bank_name || null
  const bankAccountNumber = body.bankAccountNumber || body.bank_account_number || null
  const bankAccountHolder = body.bankAccountHolder || body.bank_account_holder || null
  const bankColor = body.bankColor || body.bank_color || null

  // optional fields expected by frontend
  const amount = body.amount ? parseFloat(body.amount) : null
  const referenceNumber = body.referenceNumber || body.reference_number || null
  // carnetNumber already resolved above (from body or userProfile)

  const result = await db.query(insertSql, [userId, bankId, bankName, bankAccountNumber, bankAccountHolder, bankColor, documentNumber, fullName, email, fileName, fileSize, fileMime, filePath, amount, referenceNumber, carnetNumber, status]);
    const row = result.rows[0];

    const mapped = mapRow(row);
    // If a file was uploaded, include a public URL to access it
    if (fileName) {
      mapped.fileUrl = `/uploads/${fileName}`;
    }

    // Create activity log (non-blocking)
    try {
      const actorEmail = (req.user && req.user.email) || mapped.email || null;
      activities.createActivity({ actorEmail, actorId: req.user && req.user.id, type: 'deposit_created', payload: { depositId: mapped.id, fullName: mapped.fullName, email: mapped.email } });
    } catch (e) {
      console.warn('Could not create activity log for deposit create:', e && e.message ? e.message : e);
    }

    return res.status(201).json(mapped);
  } catch (err) {
    console.error('Error creando depósito:', err);
    return res.status(500).json({ message: 'Ocurrió un error al crear el depósito.' });
  }
};

exports.getDepositsByEmail = async (req, res) => {
  try {
    const email = req.query.email;
    // if user is not admin, ensure they can only request their own deposits
    if (!email) return res.status(400).json({ message: 'email es obligatorio como query param' });
    if (!(req.user && req.user.role === 'admin') && req.user && req.user.email && req.user.email.toLowerCase() !== String(email).toLowerCase()) {
      return res.status(403).json({ message: 'No autorizado para ver depósitos de otro usuario' })
    }

    const isAdmin = !!(req.user && req.user.role === 'admin')

    // Non-admin (student): only return the latest active (non-deleted) deposit; if none,
    // fall back to the latest reviewed decision unless that reviewed row was explicitly
    // deleted by the owner (owner_deleted = TRUE) as part of a reset flow.
    if (!isAdmin) {
      const latestNonDeleted = await db.query(
        `SELECT * FROM deposits
         WHERE lower(email) = lower($1)
           AND (is_deleted IS NULL OR is_deleted = FALSE)
         ORDER BY created_at DESC
         LIMIT 1`,
        [email]
      );
      const row = latestNonDeleted.rows[0] || null
      if (row) return res.json(mapRow(row))

      // fallback: latest reviewed, but ignore owner-deleted resets
      const reviewed = await db.query(
        `SELECT * FROM deposits
         WHERE lower(email) = lower($1)
           AND lower(status) IN ('approved','rejected')
         ORDER BY COALESCE(review_date, created_at) DESC
         LIMIT 1`,
        [email]
      );
      const r = reviewed.rows[0] || null
      if (r && r.owner_deleted) return res.json(null)
      return res.json(r ? mapRow(r) : null)
    }

    // Admin: prefer latest non-deleted; if none, fall back to latest reviewed (approved/rejected) even if soft-deleted
    const latestNonDeleted = await db.query(
      `SELECT * FROM deposits
       WHERE lower(email) = lower($1)
         AND (is_deleted IS NULL OR is_deleted = FALSE)
       ORDER BY created_at DESC
       LIMIT 1`,
      [email]
    );
    if (latestNonDeleted.rows[0]) {
      return res.json(mapRow(latestNonDeleted.rows[0]));
    }

    const reviewed = await db.query(
      `SELECT * FROM deposits
       WHERE lower(email) = lower($1)
         AND lower(status) IN ('approved','rejected')
       ORDER BY COALESCE(review_date, created_at) DESC
       LIMIT 1`,
      [email]
    );
    const row = reviewed.rows[0] || null
    return res.json(row ? mapRow(row) : null)
  } catch (err) {
    console.error('Error consultando depósitos:', err);
    return res.status(500).json({ message: 'Ocurrió un error al consultar los depósitos.' });
  }
};

// Admin: list deposits with filters + pagination
exports.listDeposits = async (req, res) => {
  try {
    // Debug: log requester identity for troubleshooting
    console.log('[debug] listDeposits called by:', req.user);
    if (!(req.user && req.user.role === 'admin')) {
      console.warn('[debug] listDeposits: access denied - not admin');
      return res.status(403).json({ message: 'No autorizado' })
    }

    const { status, q } = req.query || {}
    const limit = parseInt(req.query.limit || '50', 10)
    const offset = parseInt(req.query.offset || '0', 10)

    const where = []
    const params = []
    let idx = 1

    if (status) {
      where.push(`status = $${idx++}`)
      params.push(status)
    }

    if (q) {
      const like = `%${String(q).toLowerCase()}%`
      where.push(`(lower(full_name) LIKE $${idx} OR lower(email) LIKE $${idx} OR lower(reference_number) LIKE $${idx} OR carnet_number LIKE $${idx})`)
      params.push(like)
      idx++
    }

    // Use a LEFT JOIN to users so we can coalesce carnet_number from users when
    // the deposits row doesn't include it. This avoids extra per-row queries
    // from the frontend and ensures the admin list shows the student's carné.
    let sql = `SELECT deposits.*, COALESCE(deposits.carnet_number, u.carnet_number) AS carnet_number
      FROM deposits
      LEFT JOIN users u ON lower(deposits.email) = lower(u.email)
      WHERE (deposits.is_deleted IS NULL OR deposits.is_deleted = FALSE)`
    if (where.length) sql += ' AND ' + where.join(' AND ')
    sql += ' ORDER BY deposits.created_at DESC LIMIT $' + idx++ + ' OFFSET $' + idx++
    params.push(limit, offset)

    const result = await db.query(sql, params)
    const mapped = result.rows.map(r => {
      const m = mapRow(r)
      if (m.fileName) m.fileUrl = `/uploads/${m.fileName}`
      return m
    })
    return res.json(mapped)
  } catch (err) {
    console.error('Error listando depósitos:', err);
    return res.status(500).json({ message: 'Ocurrió un error al listar los depósitos.' });
  }
}

// Get deposit by id (admin or owner)
exports.getDepositById = async (req, res) => {
  try {
    const { id } = req.params
    const result = await db.query('SELECT * FROM deposits WHERE id = $1', [id])
    const row = result.rows[0]
    if (!row) return res.status(404).json({ message: 'Depósito no encontrado' })

    // owner or admin
    if (!(req.user && req.user.role === 'admin')) {
      const userIdentifier = req.user && (req.user.email || req.user.id)
      if (!userIdentifier || String(row.email).toLowerCase() !== String(userIdentifier).toLowerCase()) {
        return res.status(403).json({ message: 'No autorizado' })
      }
    }

    let mapped = mapRow(row)

    // If the deposit row doesn't include a carnet number, try to enrich it
    // from the users table using the deposit email. This helps ensure the
    // admin detail view receives the student's carnet even if the deposits
    // table wasn't populated with it at creation time.
    try {
      if ((!mapped.carnetNumber || String(mapped.carnetNumber).trim() === '') && mapped.email) {
        const ures = await db.query('SELECT carnet_number FROM users WHERE lower(email) = lower($1) LIMIT 1', [mapped.email])
        const urow = ures.rows[0]
        if (urow && urow.carnet_number) {
          mapped.carnetNumber = urow.carnet_number
        }
      }
    } catch (e) {
      // non-fatal: log and continue returning the deposit without carnet
      console.warn('Could not enrich deposit with user carnet:', e && e.message ? e.message : e)
    }

    if (mapped.fileName) mapped.fileUrl = `/uploads/${mapped.fileName}`
    return res.json(mapped)
  } catch (err) {
    console.error('Error obteniendo depósito por id:', err)
    return res.status(500).json({ message: 'Ocurrió un error' })
  }
}

// Admin review action: approve or reject
exports.reviewDeposit = async (req, res) => {
  try {
    if (!(req.user && req.user.role === 'admin')) return res.status(403).json({ message: 'No autorizado' })
    const { id } = req.params
  // accept both 'notes' (custom reason) and 'reason' (quick templates) from the frontend
  const { action, reviewedBy, notes, reason } = req.body || {}
    if (!action || !['approve', 'reject'].includes(action)) return res.status(400).json({ message: 'action must be approve or reject' })

    const status = action === 'approve' ? 'approved' : 'rejected'
  // prefer explicit notes (custom reason); fall back to the quick 'reason' templates
  const reviewNotes = notes || reason || null

    const updateSql = `UPDATE deposits SET status = $1, reviewed_by = $2, review_notes = $3, review_date = NOW() WHERE id = $4 RETURNING *`
    const result = await db.query(updateSql, [status, reviewedBy || (req.user && req.user.email) || null, reviewNotes, id])
    const row = result.rows[0]
    if (!row) return res.status(404).json({ message: 'Depósito no encontrado' })
    const mapped = mapRow(row)
    if (mapped.fileName) mapped.fileUrl = `/uploads/${mapped.fileName}`
    // Create activity log for review action
    try {
      const actorEmail = (req.user && req.user.email) || null;
      const actionLabel = action === 'approve' ? 'deposit_approved' : 'deposit_rejected';
      activities.createActivity({ actorEmail, actorId: req.user && req.user.id, type: actionLabel, payload: { depositId: mapped.id, fullName: mapped.fullName, email: mapped.email, notes: reviewNotes } });
    } catch (e) {
      console.warn('Could not create activity log for deposit review:', e && e.message ? e.message : e);
    }

    return res.json(mapped)
  } catch (err) {
    console.error('Error revisando depósito:', err)
    return res.status(500).json({ message: 'Ocurrió un error' })
  }
}

exports.updateDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    let bankId = body.bankId || body.bank_id;
  let documentNumber = body.documentNumber || body.document_number;
  let fullName = body.fullName || body.full_name;
  let carnetNumber = body.carnetNumber || body.carnet_number || null;
    let fileName = body.fileName || null;
    let fileSize = body.fileSize ? parseInt(body.fileSize, 10) : null;
    let fileMime = body.fileMime || null;
    let filePath = body.filePath || null;

    if (req.file) {
      fileName = req.file.filename || req.file.originalname
      fileSize = req.file.size || null
      fileMime = req.file.mimetype || null
      filePath = req.file.path || null
    }

    // Reset status to 'review' when student re-uploads or updates their deposit
    const status = 'review';

  // Enrich missing fields from authenticated user if available
  if (req.user && (req.user.id || req.user.email)) {
      try {
        let userProfileRes;
        if (req.user.id) {
          userProfileRes = await db.query('SELECT carnet_number, full_name, email FROM users WHERE id = $1', [req.user.id]);
        } else {
          userProfileRes = await db.query('SELECT carnet_number, full_name, email FROM users WHERE lower(email) = lower($1)', [req.user.email]);
        }
        const userProfile = userProfileRes.rows[0];
        if (userProfile) {
          if (!fullName && userProfile.full_name) fullName = userProfile.full_name;
          if (!documentNumber && userProfile.document_number) documentNumber = userProfile.document_number;
          if (!carnetNumber && userProfile.carnet_number) carnetNumber = userProfile.carnet_number;
          // If body didn't include carnetNumber but user has it, we set carnetNumber above so it will be included in the UPDATE params below
        }
      } catch (e) {
        console.warn('Could not enrich deposit update from user profile:', e && e.message ? e.message : e);
      }
    }

  // Allow updating bank snapshot fields when student changes bank
  const bankName = body.bankName || body.bank_name || null
  const bankAccountNumber = body.bankAccountNumber || body.bank_account_number || null
  const bankAccountHolder = body.bankAccountHolder || body.bank_account_holder || null
  const bankColor = body.bankColor || body.bank_color || null

  const updateSql = `UPDATE deposits SET bank_id = $1, bank_name = $2, bank_account_number = $3, bank_account_holder = $4, bank_color = $5, document_number = $6, full_name = $7, file_name = $8, file_size = $9, file_mime = $10, file_path = $11, status = $12, carnet_number = $13 WHERE id = $14 RETURNING *`;
    // Ensure user owns the deposit or is admin
  const existing = await db.query('SELECT * FROM deposits WHERE id = $1', [id]);
    const existingRow = existing.rows[0];
    if (!existingRow) return res.status(404).json({ message: 'Depósito no encontrado' });
    if (!(req.user && req.user.role === 'admin')) {
      const userIdentifier = req.user && (req.user.email || req.user.id)
      if (!userIdentifier || String(existingRow.email).toLowerCase() !== String(userIdentifier).toLowerCase()) {
        return res.status(403).json({ message: 'No autorizado para actualizar este depósito' })
      }
    }

  const result = await db.query(updateSql, [bankId, bankName, bankAccountNumber, bankAccountHolder, bankColor, documentNumber, fullName, fileName, fileSize, fileMime, filePath, status, carnetNumber, id]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ message: 'Depósito no encontrado' });
    const mapped = mapRow(row);
    if (mapped.fileName) mapped.fileUrl = `/uploads/${mapped.fileName}`;
    return res.json(mapped);
  } catch (err) {
    console.error('Error actualizando depósito:', err);
    return res.status(500).json({ message: 'Ocurrió un error al actualizar el depósito.' });
  }
};


exports.deleteDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT * FROM deposits WHERE id = $1', [id]);
    const row = existing.rows[0];
    if (!row) return res.status(404).json({ message: 'Depósito no encontrado' });


    const isAdmin = !!(req.user && req.user.role === 'admin')
    if (!isAdmin) {
      const userIdentifier = req.user && (req.user.email || req.user.id)
      if (!userIdentifier || String(row.email).toLowerCase() !== String(userIdentifier).toLowerCase()) {
        return res.status(403).json({ message: 'No autorizado para eliminar este depósito' })
      }
      // Owner deletion: reset flow. For non-approved deposits, soft-delete and mark owner_deleted = TRUE
      // so the student state becomes 'none' while preserving an audit trail for admins.
      const status = (row.status || '').toLowerCase()
      if (status === 'approved') {
        return res.status(400).json({ message: 'No se puede eliminar un depósito aprobado.' })
      }
      // Attempt to remove the uploaded file to free disk, even when soft-deleting
      try {
        const fs = require('fs')
        if (row.file_path) {
          fs.unlink(row.file_path, (err) => {
            if (err) console.warn('Could not remove uploaded file:', err.message || err)
          })
        }
      } catch (e) {
        console.warn('File remove attempt failed:', e && e.message ? e.message : e)
      }
      await db.query('UPDATE deposits SET is_deleted = TRUE, owner_deleted = TRUE, deleted_at = NOW() WHERE id = $1', [id]);
      return res.status(204).send();
    }
    // Admin deletion: If deposit was already reviewed (approved/rejected), soft-delete to preserve student state
    // Otherwise, for 'review' (pending), hard-delete
    const reviewedStates = ['approved','rejected']
    if (row.status && reviewedStates.includes(String(row.status).toLowerCase())) {
      await db.query('UPDATE deposits SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1', [id]);
    } else {
      try {
        const fs = require('fs')
        if (row.file_path) {
          fs.unlink(row.file_path, (err) => {
            if (err) console.warn('Could not remove uploaded file:', err.message || err)
          })
        }
      } catch (e) {
        console.warn('File remove attempt failed:', e && e.message ? e.message : e)
      }
      await db.query('DELETE FROM deposits WHERE id = $1', [id]);
    }
    return res.status(204).send();
  } catch (err) {
    console.error('Error deleting deposit:', err)
    return res.status(500).json({ message: 'Ocurrió un error al eliminar el depósito' })
  }
}
