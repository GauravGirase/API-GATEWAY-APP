const jwt = require('jsonwebtoken');

// ─── Sign Access Token (short-lived: 1h) ─────────────────────────
const signAccessToken = (user) => {
  return jwt.sign(
    {
      sub: user._id,           // subject = user ID
      email: user.email,
      roles: user.roles,       // e.g. ["admin", "user"]
      type: 'access',
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
};

// ─── Sign Refresh Token (long-lived: 7d) ─────────────────────────
const signRefreshToken = (userId) => {
  return jwt.sign(
    { sub: userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

// ─── Verify Access Token ──────────────────────────────────────────
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

// ─── Verify Refresh Token ─────────────────────────────────────────
const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
