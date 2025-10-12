const db = require('../db');

function nowIso() {
  return new Date().toISOString();
}

function mapRowToCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    accountNumber: row.account_number,
    accountHolder: row.account_holder,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

exports.listBanks = async (_req, res) => {
  try {
  const result = await db.query('SELECT * FROM banks ORDER BY created_at');
  const mapped = result.rows.map(mapRowToCamel);
  return res.json(mapped);
  } catch (err) {
    console.error('Error listando bancos:', err);
    return res.status(500).json({ message: 'Ocurrió un error al listar los bancos.' });
  }
};

exports.getBank = async (req, res) => {
  try {
    const { id } = req.params;
  const result = await db.query('SELECT * FROM banks WHERE id = $1', [id]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ message: 'Banco no encontrado' });
  return res.json(mapRowToCamel(row));
  } catch (err) {
    console.error('Error obteniendo banco:', err);
    return res.status(500).json({ message: 'Ocurrió un error al obtener el banco.' });
  }
};

exports.createBank = async (req, res) => {
  try {
    const body = req.body || {};
    // Accept camelCase or snake_case
    const name = body.name ?? body.name_text ?? body.name;
    const color = body.color ?? body.color;
    const accountNumber = body.accountNumber ?? body.account_number ?? body.account;
    const accountHolder = body.accountHolder ?? body.account_holder ?? body.holder;
    const isActive = body.hasOwnProperty('isActive') ? body.isActive : (body.hasOwnProperty('is_active') ? body.is_active : true);

    if (!name || !accountNumber || !accountHolder) {
      return res.status(400).json({ message: 'name, accountNumber y accountHolder son obligatorios.' });
    }

    const insertSql = `INSERT INTO banks (name, color, account_number, account_holder, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING *`;

    const now = nowIso();
  const result = await db.query(insertSql, [String(name).trim(), color || null, String(accountNumber).trim(), String(accountHolder).trim(), isActive === false ? false : true, now]);

  return res.status(201).json(mapRowToCamel(result.rows[0]));
  } catch (err) {
    console.error('Error creando banco:', err);
    return res.status(500).json({ message: 'Ocurrió un error al crear el banco.' });
  }
};

exports.updateBank = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    // Fetch existing bank
    const existingRes = await db.query('SELECT * FROM banks WHERE id = $1', [id]);
    const existing = existingRes.rows[0];
    if (!existing) return res.status(404).json({ message: 'Banco no encontrado' });

    // Merge: prefer provided body values (accept camelCase and snake_case), otherwise keep existing
    const name = body.hasOwnProperty('name') ? String(body.name).trim() : (body.hasOwnProperty('name_text') ? String(body.name_text).trim() : existing.name);
    const color = body.hasOwnProperty('color') ? body.color : existing.color;
    const accountNumber = body.hasOwnProperty('accountNumber') ? String(body.accountNumber).trim() : (body.hasOwnProperty('account_number') ? String(body.account_number).trim() : existing.account_number);
    const accountHolder = body.hasOwnProperty('accountHolder') ? String(body.accountHolder).trim() : (body.hasOwnProperty('account_holder') ? String(body.account_holder).trim() : existing.account_holder);
    const isActive = body.hasOwnProperty('isActive') ? !!body.isActive : (body.hasOwnProperty('is_active') ? !!body.is_active : existing.is_active);

    const updateSql = `UPDATE banks SET name = $1, color = $2, account_number = $3, account_holder = $4, is_active = $5, updated_at = $6 WHERE id = $7 RETURNING *`;
    const now = nowIso();
  const result = await db.query(updateSql, [name, color || null, accountNumber, accountHolder, isActive === false ? false : true, now, id]);

  const row = result.rows[0];
  return res.json(mapRowToCamel(row));
  } catch (err) {
    console.error('Error actualizando banco:', err);
    return res.status(500).json({ message: 'Ocurrió un error al actualizar el banco.' });
  }
};

exports.deleteBank = async (req, res) => {
  try {
    const { id } = req.params;
  const result = await db.query('DELETE FROM banks WHERE id = $1 RETURNING *', [id]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ message: 'Banco no encontrado' });
  return res.json({ message: 'Banco eliminado', bank: mapRowToCamel(row) });
  } catch (err) {
    console.error('Error eliminando banco:', err);
    return res.status(500).json({ message: 'Ocurrió un error al eliminar el banco.' });
  }
};
