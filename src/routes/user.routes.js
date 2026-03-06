const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth.controller');
const { validateRequest } = require('../middleware/validate.middleware');

const router = express.Router();

// ─── Rate limit login attempts (5 per 15 min per IP) ─────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// ─── Validation rules ─────────────────────────────────────────────
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

// ─── Routes ──────────────────────────────────────────────────────

// POST /auth/register
// Body: { name, email, password }
router.post('/register', registerValidation, validateRequest, authController.register);

// POST /auth/login
// Body: { email, password }
// Returns: { accessToken, refreshToken, user }
router.post('/login', loginLimiter, loginValidation, validateRequest, authController.login);

// POST /auth/refresh
// Body: { refreshToken }
// Returns: { accessToken }  (new access token using refresh token)
router.post('/refresh', authController.refresh);

// POST /auth/logout
// Body: { refreshToken }
// Invalidates the refresh token
router.post('/logout', authController.logout);

// POST /auth/verify
// Header: Authorization: Bearer <token>
// Returns: decoded token payload (used by API Gateway to verify tokens)
router.post('/verify', authController.verify);

module.exports = router;
