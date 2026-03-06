const express = require('express');
const { protect, requireRole } = require('../middleware/auth.middleware');
const userController = require('../controllers/user.controller');

const router = express.Router();

// All routes below require a valid JWT
router.use(protect);

// GET /users/me — get your own profile
router.get('/me', userController.getMe);

// PATCH /users/me — update your own profile
router.patch('/me', userController.updateMe);

// PATCH /users/me/password — change password
router.patch('/me/password', userController.changePassword);

// ─── Admin only routes ────────────────────────────────────────────

// GET /users — list all users (admin only)
router.get('/', requireRole('admin'), userController.getAllUsers);

// GET /users/:id — get user by id (admin only)
router.get('/:id', requireRole('admin'), userController.getUserById);

// PATCH /users/:id/roles — assign roles (admin only)
router.patch('/:id/roles', requireRole('admin'), userController.updateRoles);

// DELETE /users/:id — deactivate user (admin only)
router.delete('/:id', requireRole('admin'), userController.deactivateUser);

module.exports = router;
