const db = require('../db');

// Get current user info from the database based on their session token
const getCurrentUser = async (req, res) => {
  try {
    // El middleware de auth ya debería haber añadido el usuario a req
    if (!req.user) {
      return res.status(401).json({ error: 'No authenticated user' });
    }

    // Obtener la información completa del usuario de la base de datos
    const { rows } = await db.query(
      'SELECT id, email, full_name, role, has_used_unenrollment, carnet_number, avatar_url FROM users WHERE id = $1',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Devolver la información necesaria del usuario
    const user = rows[0];
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      hasUsedUnenrollment: !!user.has_used_unenrollment,
      carnetNumber: user.carnet_number || null,
      avatarUrl: user.avatar_url || null,
    });
  } catch (error) {
    console.error('Error getting current user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getCurrentUser
};