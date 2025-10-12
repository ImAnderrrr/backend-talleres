import textwrap
from pathlib import Path

chunks = []

chunks.append(textwrap.dedent(
    """
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sendVerificationCode } = require('../services/emailService');
const { verifyEmailDeliverability } = require('../services/emailValidationService');
const { generateVerificationCode } = require('../utils/codeGenerator');

const CODE_EXPIRATION_MINUTES = 10;
const STUDENT_ROLE = 'student';
const ALLOWED_ZEROBOUNCE_STATUSES = ['valid', 'catch-all'];

function sanitizeEmail(email = '') {
  return email.trim().toLowerCase();
}

function isInstitutionalEmail(email) {
  return /@miumg\.edu\.gt$/i.test(email);
}

function buildUserPayload(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isVerified: row.is_verified,
  };
}

function getExpirationDate() {
  return new Date(Date.now() + CODE_EXPIRATION_MINUTES * 60 * 1000);
}

"""))

chunks.append(textwrap.dedent(
    """
exports.register = async (req, res) => {
  try {
    const { fullName, email, password, carnetNumber } = req.body || {};

    if (!fullName || !email || !password || !carnetNumber) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
    }

    const normalizedEmail = sanitizeEmail(email);

    if (!isInstitutionalEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Debes utilizar un correo institucional @miumg.edu.gt.' });
    }

    const existingUserResult = await db.query('SELECT * FROM users WHERE email = ', [normalizedEmail]);
    const existingUser = existingUserResult.rows[0];

    if (existingUser && existingUser.is_verified) {
      return res.status(409).json({ message: 'Este correo ya se encuentra registrado. Inicia sesión o recupera tu cuenta.' });
    }

    try {
      const verificationResponse = await verifyEmailDeliverability(normalizedEmail);
      const status = String(verificationResponse.status || '').toLowerCase();
      if (!ALLOWED_ZEROBOUNCE_STATUSES.includes(status)) {
        return res.status(400).json({
          message: 'No pudimos confirmar que este correo institucional exista. Verifica el dato o contacta a soporte.',
          details: verificationResponse,
        });
      }
    } catch (validationError) {
      return res.status(502).json({
        message: validationError.message || 'Error al validar el correo institucional.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = generateVerificationCode();
    const codeExpiresAt = getExpirationDate();

"""))

