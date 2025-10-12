const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim().length > 0) {
    return secret;
  }
  return 'development_jwt_secret_change_me';
}

function getAccessTokenExpiresIn() {
  return process.env.JWT_ACCESS_EXPIRES_IN || '15m';
}

function getRefreshTokenExpiresIn() {
  return process.env.JWT_REFRESH_EXPIRES_IN || '7d';
}

function signAccessToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: getAccessTokenExpiresIn() });
}

function signRefreshToken(user) {
  // Store minimal payload for refresh token
  const payload = {
    sub: user.id,
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: getRefreshTokenExpiresIn() });
}

function verifyToken(token) {
  return jwt.verify(token, getJwtSecret());
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyToken,
};
