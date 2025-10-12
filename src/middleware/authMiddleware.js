const { verifyToken } = require('../utils/jwt')

function authMiddleware(req, res, next) {
  // Prefer Authorization header: Bearer <token>
  const auth = req.headers['authorization'] || req.headers['Authorization']
  let token = null
  if (auth) {
    const parts = String(auth).split(' ')
    if (parts.length === 2 && parts[0] === 'Bearer') token = parts[1]
  }

  // Fallback to cookie named accessToken
  if (!token && req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken
  }

  if (!token) return res.status(401).json({ message: 'Authorization token missing' })

  try {
    const payload = verifyToken(token)
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    }
    return next()
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

module.exports = authMiddleware

module.exports.requireAdmin = function (req, res, next) {
  return authMiddleware(req, res, function (err) {
    // authMiddleware sets req.user on success; if no req.user after auth, authMiddleware already responded
    if (!(req.user && req.user.role === 'admin')) return res.status(403).json({ message: 'No autorizado' })
    return next()
  })
}
