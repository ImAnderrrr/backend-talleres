const db = require('../db');

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    shortDescription: row.short_description,
    description: row.description,
    instructor: {
      name: row.instructor_name,
      title: row.instructor_title,
      bio: row.instructor_bio,
      image: row.instructor_image,
      rating: row.instructor_rating !== undefined && row.instructor_rating !== null ? Number(row.instructor_rating) : 0
    },
    category: row.category,
    date: row.date,
    time: row.time,
    duration: row.duration,
    schedule: row.schedule,
    location: row.location,
    capacity: row.capacity,
    enrolled: row.enrolled,
    status: row.status,
    image: row.image,
    equipment: row.equipment,
    requirements: row.requirements,
    agenda: row.agenda,
    tags: row.tags,
    level: row.level,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

exports.listWorkshops = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM workshops ORDER BY created_at DESC');
    const mapped = result.rows.map(r => mapRow(r));
    return res.json(mapped);
  } catch (err) {
    console.error('Error listing workshops:', err);
    return res.status(500).json({ message: 'Ocurrió un error al listar los talleres.' });
  }
}

exports.getWorkshopById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM workshops WHERE id = $1', [id]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ message: 'Taller no encontrado' });
    return res.json(mapRow(row));
  } catch (err) {
    console.error('Error getting workshop by id:', err);
    return res.status(500).json({ message: 'Ocurrió un error' });
  }
}

exports.createWorkshop = async (req, res) => {
  try {
    const body = req.body || {};
    const {
      id,
      title,
      shortDescription,
      description,
      instructor,
      category,
      date,
      time,
      duration,
      schedule,
      location,
      capacity,
      status,
      image,
      equipment,
      requirements,
      agenda,
      tags,
      level
    } = body;

    if (!id || !title) return res.status(400).json({ message: 'id y title son obligatorios' });

    const insertSql = `INSERT INTO workshops (id, title, short_description, description, instructor_name, instructor_title, instructor_bio, instructor_image, instructor_rating, category, date, time, duration, schedule, location, capacity, enrolled, status, image, equipment, requirements, agenda, tags, level, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NOW(),NOW()) RETURNING *`;

    const params = [
      id,
      title,
      shortDescription,
      description,
      instructor?.name || null,
      instructor?.title || null,
      instructor?.bio || null,
      instructor?.image || null,
      instructor?.rating !== undefined && instructor?.rating !== null ? Number(instructor.rating) : null,
      category || null,
      date || null,
      time || null,
      duration || null,
      schedule || null,
      location || null,
      capacity ? parseInt(capacity, 10) : null,
      0,
      status || 'draft',
      image || null,
      equipment ? JSON.stringify(equipment) : null,
      requirements ? JSON.stringify(requirements) : null,
      agenda ? JSON.stringify(agenda) : null,
      tags ? JSON.stringify(tags) : null,
      level || null
    ];

    const result = await db.query(insertSql, params);
    const row = result.rows[0];
    return res.status(201).json(mapRow(row));
  } catch (err) {
    console.error('Error creating workshop:', err);
    return res.status(500).json({ message: 'Ocurrió un error al crear el taller.' });
  }
}

exports.updateWorkshop = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const existing = await db.query('SELECT * FROM workshops WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ message: 'Taller no encontrado' });

  const updateSql = `UPDATE workshops SET title=$1, short_description=$2, description=$3, instructor_name=$4, instructor_title=$5, instructor_bio=$6, instructor_image=$7, instructor_rating=$8, category=$9, date=$10, time=$11, duration=$12, schedule=$13, location=$14, capacity=$15, enrolled=$16, status=$17, image=$18, equipment=$19, requirements=$20, agenda=$21, tags=$22, level=$23, updated_at=NOW() WHERE id=$24 RETURNING *`;

    const params = [
      body.title || existing.rows[0].title,
      body.shortDescription || existing.rows[0].short_description,
      body.description || existing.rows[0].description,
      body.instructor?.name || existing.rows[0].instructor_name,
      body.instructor?.title || existing.rows[0].instructor_title,
      body.instructor?.bio || existing.rows[0].instructor_bio,
      body.instructor?.image || existing.rows[0].instructor_image,
      body.instructor?.rating !== undefined && body.instructor?.rating !== null ? Number(body.instructor.rating) : existing.rows[0].instructor_rating,
      body.category || existing.rows[0].category,
      body.date || existing.rows[0].date,
      body.time || existing.rows[0].time,
      body.duration || existing.rows[0].duration,
      body.schedule || existing.rows[0].schedule,
      body.location || existing.rows[0].location,
      body.capacity ? parseInt(body.capacity, 10) : existing.rows[0].capacity,
      body.enrolled ? parseInt(body.enrolled, 10) : existing.rows[0].enrolled,
      body.status || existing.rows[0].status,
      body.image || existing.rows[0].image,
      body.equipment ? JSON.stringify(body.equipment) : existing.rows[0].equipment,
      body.requirements ? JSON.stringify(body.requirements) : existing.rows[0].requirements,
      body.agenda ? JSON.stringify(body.agenda) : existing.rows[0].agenda,
      body.tags ? JSON.stringify(body.tags) : existing.rows[0].tags,
      body.level || existing.rows[0].level,
      id
    ];

    const result = await db.query(updateSql, params);
    const row = result.rows[0];
    return res.json(mapRow(row));
  } catch (err) {
    console.error('Error updating workshop:', err);
    return res.status(500).json({ message: 'Ocurrió un error al actualizar el taller.' });
  }
}

exports.deleteWorkshop = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT * FROM workshops WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ message: 'Taller no encontrado' });
    await db.query('DELETE FROM workshops WHERE id = $1', [id]);
    return res.status(204).send();
  } catch (err) {
    console.error('Error deleting workshop:', err);
    return res.status(500).json({ message: 'Ocurrió un error al eliminar el taller.' });
  }
}
