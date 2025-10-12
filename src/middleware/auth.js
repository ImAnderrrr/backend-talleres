const { verifyToken } = require('../utils/jwt');

// Auth middleware: accept access token via Authorization: Bearer <token>
// or via an 'accessToken' cookie (if the app sets it). Do NOT accept refresh tokens here.
const auth = async (req, res, next) => {
  try {
    let token = null;

    // Prefer Authorization header
    const authHeader = req.headers && req.headers.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // Fallback to accessToken cookie (some deployments may set it)
    if (!token && req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      console.error('Token verification failed:', err.message || err);
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Normalise the decoded payload into req.user with expected fields
    req.user = {
      id: decoded.sub || decoded.id || null,
      email: decoded.email || null,
      role: decoded.role || null,
    };

    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = auth;