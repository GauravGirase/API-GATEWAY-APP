const { verifyAccessToken } = require('../utils/jwt.utils');
const User = require('../models/user.model');

// ─── protect: verify JWT, attach user to req ──────────────────────
exports.protect = async (req, res, next) => {
  try {
    // 1. Get token from header
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];

    // 2. Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired. Please refresh.' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    // 3. Check user still exists
    const user = await User.findById(decoded.sub);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    // 4. Attach user to request for downstream use
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

// ─── requireRole: check user has one of the required roles ────────
// Usage: requireRole('admin')  or  requireRole('admin', 'finance')
exports.requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasRole = req.user.roles.some((role) => roles.includes(role));
    if (!hasRole) {
      return res.status(403).json({
        error: `Access denied. Required roles: ${roles.join(', ')}`,
      });
    }
    next();
  };
};
