const bcrypt = require('bcryptjs');
const db = require('../db');
// Email OTP flow removed; no external deliverability checks
const { signAccessToken, signRefreshToken, verifyToken } = require('../utils/jwt');
const path = require('path');
const fs = require('fs');
const { validateCarnetFormat, normalizeCarnet, carnetKey } = require('../utils/carnet');

// Database stores non-admin as 'user'; normalize outward responses to 'student' for the SPA
const STUDENT_ROLE = 'user';

function normalizeRole(role) {
  const r = String(role || '').toLowerCase().trim();
  if (r === 'admin') return 'admin';
  // accept spanish variants too
  if (r === 'student' || r === 'alumno' || r === 'estudiante' || r === 'user' || r === 'usuario') return 'student';
  return r || 'student';
}

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
    role: normalizeRole(row.role),
    isVerified: row.is_verified,
  };
}

// No OTP expiration required in simplified flow

// Validate carnet availability and format
exports.validateCarnet = async (req, res) => {
  try {
    const { carnetNumber } = req.body || {};
    if (!carnetNumber) return res.status(400).json({ valid: false, available: false, message: 'Carné requerido.' });
    const fmt = validateCarnetFormat(carnetNumber);
    if (!fmt.valid) return res.status(200).json({ valid: false, available: false, message: fmt.message });
    const key = carnetKey(carnetNumber);
    const dup = await db.query("SELECT 1 FROM users WHERE REPLACE(UPPER(carnet_number), '-', '') = $1 LIMIT 1", [key]);
    if (dup.rowCount > 0) return res.status(200).json({ valid: true, available: false, message: 'Este carné ya está registrado.' });
    return res.status(200).json({ valid: true, available: true, message: 'Carné disponible.' });
  } catch (e) {
    return res.status(500).json({ valid: false, available: false, message: 'No se pudo validar el carné.' });
  }
}

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

  const existingUserResult = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    const existingUser = existingUserResult.rows[0];
    // Validate carnet format (DTO)
    const carnetValidation = validateCarnetFormat(carnetNumber);
    if (!carnetValidation.valid) {
      return res.status(400).json({ message: carnetValidation.message || 'Carné inválido.' });
    }

    const normalizedCarnet = normalizeCarnet(carnetNumber);
    const uniqueKey = carnetKey(carnetNumber); // remove hyphens for unique check

    // Enforce carnet uniqueness among verified users and pending registrations
    try {
      const dup = existingUser
        ? await db.query('SELECT id, email, is_verified FROM users WHERE REPLACE(UPPER(carnet_number), \'-\', \'\') = $1 AND id <> $2', [uniqueKey, existingUser.id])
        : await db.query('SELECT id, email, is_verified FROM users WHERE REPLACE(UPPER(carnet_number), \'-\', \'\') = $1', [uniqueKey]);
      if (dup.rows.length > 0) {
        // If existing verified user or a pending registration, block reuse
        return res.status(409).json({ message: 'Este carné ya ha sido registrado. Si crees que es un error, contacta a soporte.' });
      }
    } catch (e) {
      // continue; DB may not have column/migration yet
    }

    if (existingUser && existingUser.is_verified) {
      return res.status(409).json({ message: 'Este correo ya se encuentra registrado. Inicia sesión o recupera tu cuenta.' });
    }

    // Simplified email policy: only require domain @miumg.edu.gt (already checked above)

    const hashedPassword = await bcrypt.hash(password, 10);
  // No email verification flow

    const updateSql = 'UPDATE users\n'
      + '           SET full_name = $1,\n'
      + '               password = $2,\n'
      + '               carnet_number = $3,\n'
      + '               role = $4,\n'
      + '               is_verified = true,\n'
      + '               updated_at = NOW()\n'
      + '         WHERE id = $5\n'
      + '       RETURNING *';

    const insertSql = 'INSERT INTO users (full_name, email, password, carnet_number, role, is_verified, created_at, updated_at)\n'
      + '         VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())\n'
      + '         RETURNING *';

    let userRow;
    if (existingUser) {
      const updateResult = await db.query(updateSql, [
        fullName.trim(),
        hashedPassword,
        normalizedCarnet,
        STUDENT_ROLE,
        existingUser.id,
      ]);
      userRow = updateResult.rows[0];
    } else {
      const insertResult = await db.query(insertSql, [
        fullName.trim(),
        normalizedEmail,
        hashedPassword,
        normalizedCarnet,
        STUDENT_ROLE,
      ]);
      userRow = insertResult.rows[0];
    }

    // Auto-login: issue tokens and set refresh cookie
    const accessToken = signAccessToken(userRow);
    const refreshToken = signRefreshToken(userRow);
    try {
      await db.query('UPDATE users SET refresh_token = $1, refresh_token_expires_at = NOW() + ($2::interval) WHERE id = $3', [refreshToken, process.env.JWT_REFRESH_EXPIRES_IN || '7 days', userRow.id]);
    } catch (err) {
      console.warn('Could not persist refresh token in DB:', err.message || err);
    }
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

    return res.status(201).json({
      message: 'Registro exitoso. ¡Bienvenido! Has iniciado sesión automáticamente.',
      requiresVerification: false,
      user: buildUserPayload(userRow),
      accessToken,
    });
  } catch (error) {
    console.error('Error en registro:', error);
    return res.status(500).json({ message: 'Ocurrió un error al registrar al usuario.' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Correo y contraseña son obligatorios.' });
    }

    const normalizedEmail = sanitizeEmail(email);

    const result = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas. Verifica tu correo y contraseña.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Credenciales inválidas. Verifica tu correo y contraseña.' });
    }

    // If legacy data has is_verified=false, we now treat login as allowed and mark verified below
    if (!user.is_verified) {
      try {
        const { rows } = await db.query('UPDATE users SET is_verified = true, updated_at = NOW() WHERE id = $1 RETURNING *', [user.id]);
        if (rows[0]) Object.assign(user, rows[0]);
      } catch { /* ignore */ }
    }

    const redirectTo = user.role === 'admin' ? 'admin' : 'dashboard';
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    // Try to persist refresh token in DB for simple revocation (best-effort)
    try {
      await db.query('UPDATE users SET refresh_token = $1, refresh_token_expires_at = NOW() + ($2::interval) WHERE id = $3', [refreshToken, process.env.JWT_REFRESH_EXPIRES_IN || '7 days', user.id]);
    } catch (err) {
      // Non-fatal: if columns don't exist, continue without DB persist
      console.warn('Could not persist refresh token in DB:', err.message || err);
    }

    // Set refresh token as httpOnly secure cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // allow SPA fetch POSTs across ports in development
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7, // fallback 7 days
    });

    // Optionally set access token as a cookie too (short lived) OR return in body
    // We'll return access token in body for the SPA to store in memory if needed
    return res.json({
      message: 'Inicio de sesión exitoso.',
      user: buildUserPayload(user),
      redirectTo,
      accessToken,
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ message: 'Ocurrió un error al iniciar sesión.' });
  }
};

// Legacy verify/resend endpoints removed


// Refresh access token using httpOnly refresh token cookie
exports.refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies && req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ message: 'Refresh token missing' });

    let payload;
    try {
      payload = verifyToken(refreshToken);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const userId = payload.sub;
    const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: 'User not found' });

    // Optional: compare stored refresh token
    try {
      if (user.refresh_token && user.refresh_token !== refreshToken) {
        return res.status(401).json({ message: 'Refresh token mismatch' });
      }
    } catch (e) {
      // ignore if column missing
    }

    const newAccessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);

    // Persist new refresh token (best-effort)
    try {
      await db.query('UPDATE users SET refresh_token = $1, refresh_token_expires_at = NOW() + ($2::interval) WHERE id = $3', [newRefreshToken, process.env.JWT_REFRESH_EXPIRES_IN || '7 days', user.id]);
    } catch (err) {
      console.warn('Could not persist refresh token in DB:', err.message || err);
    }

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

  return res.json({ accessToken: newAccessToken, user: buildUserPayload(user) });
  } catch (err) {
    console.error('Error refreshing token:', err);
    return res.status(500).json({ message: 'Error refreshing token' });
  }
};

// Logout - clear cookie and optionally clear stored refresh token
exports.logout = async (req, res) => {
  try {
    // Clear refresh token in DB if possible
    const refreshToken = req.cookies && req.cookies.refreshToken;
    if (refreshToken) {
      try {
        // Try to find user by refresh token and clear it
        await db.query('UPDATE users SET refresh_token = NULL, refresh_token_expires_at = NULL WHERE refresh_token = $1', [refreshToken]);
      } catch (e) {
        // ignore if column missing
      }
    }

  // Clear cookie with same options used when setting it
  res.clearCookie('refreshToken', { path: '/', sameSite: 'lax' });
    return res.json({ message: 'Sesión cerrada' });
  } catch (err) {
    console.error('Error during logout:', err);
    return res.status(500).json({ message: 'Ocurrió un error cerrando la sesión' });
  }
};

// validateInstitutionalEmail removed; frontend validates domain locally

// Update current user's profile (only editable fields: full_name)
exports.updateMe = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'No autenticado' });
    const { fullName } = req.body || {};
    if (!fullName || String(fullName).trim().length < 2) {
      return res.status(400).json({ message: 'Nombre completo inválido' });
    }
    const { rows } = await db.query('UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, full_name, role, has_used_unenrollment, carnet_number, avatar_url', [String(fullName).trim(), req.user.id]);
    const u = rows[0];
    return res.json({
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: normalizeRole(u.role),
      hasUsedUnenrollment: !!u.has_used_unenrollment,
      carnetNumber: u.carnet_number || null,
      avatarUrl: u.avatar_url || null,
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    return res.status(500).json({ message: 'Error actualizando perfil' });
  }
};

// Upload avatar image, store under /uploads and persist URL in users.avatar_url
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'No autenticado' });
    if (!req.file) return res.status(400).json({ message: 'No se subió ninguna imagen' });

    // Limit MIME types at middleware already; here just persist the path
    const fileUrl = `/uploads/${req.file.filename}`;
    const { rows } = await db.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING avatar_url', [fileUrl, req.user.id]);
    return res.status(201).json({ avatarUrl: rows[0]?.avatar_url || fileUrl });
  } catch (err) {
    console.error('Error uploading avatar:', err);
    return res.status(500).json({ message: 'Error subiendo avatar' });
  }
};
