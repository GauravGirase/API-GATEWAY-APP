const User = require('../models/user.model');
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require('../utils/jwt.utils');

// ─── Helper: format user for response (no password) ───────────────
const formatUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  roles: user.roles,
  createdAt: user.createdAt,
});

// ─── POST /auth/register ──────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Check if email already taken
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Create user (password auto-hashed by model pre-save hook)
    const user = await User.create({ name, email, password });

    // Issue tokens
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user._id);

    // Store refresh token in DB (allows revocation)
    user.refreshTokens = [refreshToken];
    await user.save({ validateBeforeSave: false });

    res.status(201).json({
      message: 'Registration successful',
      accessToken,
      refreshToken,
      user: formatUser(user),
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /auth/login ─────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user and explicitly include password field
    const user = await User.findOne({ email }).select('+password +refreshTokens');

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Issue tokens
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user._id);

    // Store refresh token (keep up to 5 active sessions)
    user.refreshTokens = [...(user.refreshTokens || []).slice(-4), refreshToken];
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    res.json({
      message: 'Login successful',
      accessToken,           // short-lived (1h) — send in API requests
      refreshToken,          // long-lived (7d) — store securely, use to renew
      user: formatUser(user),
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /auth/refresh ───────────────────────────────────────────
exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify the refresh token signature
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Find user and check token is in their stored list (not revoked)
    const user = await User.findById(decoded.sub).select('+refreshTokens');
    if (!user || !user.refreshTokens.includes(refreshToken)) {
      return res.status(401).json({ error: 'Refresh token revoked' });
    }

    // Issue new access token
    const newAccessToken = signAccessToken(user);

    res.json({
      accessToken: newAccessToken,
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /auth/logout ────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify token to get userId
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Remove just this refresh token (logout from one device)
    await User.findByIdAndUpdate(decoded.sub, {
      $pull: { refreshTokens: refreshToken },
    });

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

// ─── POST /auth/verify ────────────────────────────────────────────
// Used by API Gateway (Kong) or other services to validate tokens
exports.verify = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      return res.status(401).json({
        error: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
      });
    }

    // Check user still exists and is active
    const user = await User.findById(decoded.sub);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User no longer active' });
    }

    // Check password wasn't changed after token was issued
    if (user.passwordChangedAfter(decoded.iat)) {
      return res.status(401).json({ error: 'Password changed. Please log in again.' });
    }

    // Return user info — API Gateway can forward these as headers
    res.json({
      valid: true,
      userId: decoded.sub,
      email: decoded.email,
      roles: decoded.roles,
    });
  } catch (err) {
    next(err);
  }
};
