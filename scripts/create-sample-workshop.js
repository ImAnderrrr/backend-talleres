#!/usr/bin/env node
// Creates or updates a sample workshop for testing
// Usage: node scripts/create-sample-workshop.js [--id WK-TEST]

const db = require('../src/db');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

(async () => {
  const id = arg('--id', 'WK-TEST');
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS workshops (
      id VARCHAR(100) PRIMARY KEY,
      title TEXT NOT NULL,
      short_description TEXT,
      description TEXT,
      instructor_name VARCHAR(200),
      instructor_title VARCHAR(200),
      instructor_bio TEXT,
      instructor_image VARCHAR(500),
      instructor_rating NUMERIC(3,2),
      category VARCHAR(100),
      date TIMESTAMPTZ,
      time VARCHAR(50),
      duration VARCHAR(100),
      schedule VARCHAR(200),
      location VARCHAR(200),
      capacity INTEGER,
      enrolled INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'draft',
      image VARCHAR(500),
      equipment JSONB,
      requirements JSONB,
      agenda JSONB,
      tags JSONB,
      level VARCHAR(50),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const { rows } = await db.query('SELECT * FROM workshops WHERE id = $1', [id]);
    const title = 'Taller de Prueba';
    const now = new Date();
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 3, 12, 0, 0));
    const payload = {
      id,
      title,
      shortDescription: 'Taller de demostración para pruebas E2E',
      description: 'Contenido introductorio y dinámico. Trae tu laptop.',
      instructor: { name: 'Ing. Demo', title: 'Instructor', bio: 'Experto en talleres', image: null, rating: 4.8 },
      category: 'Tecnología',
      date: date.toISOString().slice(0, 10),
      time: '18:00',
      duration: '2 horas',
      schedule: 'Única sesión',
      location: 'Auditorio UMG',
      capacity: 50,
      status: 'published',
      image: null,
      equipment: JSON.stringify(['Proyector', 'WiFi']),
      requirements: JSON.stringify(['Cuenta institucional']),
      agenda: JSON.stringify(['Introducción', 'Práctica', 'Cierre']),
      tags: JSON.stringify(['demo','qr','inscripción']),
      level: 'Todos'
    };

    if (rows[0]) {
      await db.query(
        `UPDATE workshops SET 
          title=$1, short_description=$2, description=$3, 
          instructor_name=$4, instructor_title=$5, instructor_bio=$6, instructor_image=$7, instructor_rating=$8,
          category=$9, date=$10, time=$11, duration=$12, schedule=$13, location=$14, capacity=$15,
          status=$16, image=$17, equipment=$18, requirements=$19, agenda=$20, tags=$21, level=$22, updated_at=NOW()
         WHERE id=$23`,
        [payload.title, payload.shortDescription, payload.description,
         payload.instructor.name, payload.instructor.title, payload.instructor.bio, payload.instructor.image, payload.instructor.rating,
         payload.category, payload.date, payload.time, payload.duration, payload.schedule, payload.location, payload.capacity,
         payload.status, payload.image, payload.equipment, payload.requirements, payload.agenda, payload.tags, payload.level, id]
      );
      console.log('Sample workshop updated:', id);
    } else {
      await db.query(
        `INSERT INTO workshops (id, title, short_description, description, instructor_name, instructor_title, instructor_bio, instructor_image, instructor_rating, category, date, time, duration, schedule, location, capacity, enrolled, status, image, equipment, requirements, agenda, tags, level, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,$17,$18,$19,$20,$21,$22,$23,NOW(),NOW())`,
        [id, payload.title, payload.shortDescription, payload.description, payload.instructor.name, payload.instructor.title, payload.instructor.bio, payload.instructor.image, payload.instructor.rating, payload.category, payload.date, payload.time, payload.duration, payload.schedule, payload.location, payload.capacity, payload.status, payload.image, payload.equipment, payload.requirements, payload.agenda, payload.tags, payload.level]
      );
      console.log('Sample workshop created:', id);
    }
    process.exit(0);
  } catch (e) {
    console.error('Failed to create sample workshop:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
