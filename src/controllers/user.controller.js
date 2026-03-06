const User = require('../models/user.model');

// GET /users/me
exports.getMe = (req, res) => {
  res.json({ user: req.user });
};

// PATCH /users/me
exports.updateMe = async (req, res, next) => {
  try {
    const { name } = req.body;
    // Don't allow updating password or roles through this route
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { name },
      { new: true, runValidators: true }
    );
    res.json({ user: updated });
  } catch (err) {
    next(err);
  }
};

// PATCH /users/me/password
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.password = newPassword;
    user.passwordChangedAt = new Date();
    user.refreshTokens = []; // Invalidate all sessions
    await user.save();

    res.json({ message: 'Password changed. Please log in again.' });
  } catch (err) {
    next(err);
  }
};

// GET /users (admin)
exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({ isActive: true }).select('-__v');
    res.json({ count: users.length, users });
  } catch (err) {
    next(err);
  }
};

// GET /users/:id (admin)
exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

// PATCH /users/:id/roles (admin)
exports.updateRoles = async (req, res, next) => {
  try {
    const { roles } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { roles },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Roles updated', user });
  } catch (err) {
    next(err);
  }
};

// DELETE /users/:id (admin)
exports.deactivateUser = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isActive: false, refreshTokens: [] });
    res.json({ message: 'User deactivated' });
  } catch (err) {
    next(err);
  }
};
