const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false,           // Never returned in queries by default
    },
    roles: {
      type: [String],
      enum: ['user', 'admin', 'finance', 'support'],
      default: ['user'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    refreshTokens: {
      type: [String],
      select: false,           // Hidden from queries
    },
    lastLoginAt: Date,
    passwordChangedAt: Date,
  },
  {
    timestamps: true,          // adds createdAt, updatedAt
  }
);

// ─── Hash password before saving ──────────────────────────────────
userSchema.pre('save', async function (next) {
  // Only hash if password was changed
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ─── Instance method: compare passwords ───────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── Instance method: check if password changed after token issued ─
userSchema.methods.passwordChangedAfter = function (jwtIssuedAt) {
  if (this.passwordChangedAt) {
    const changedAt = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return jwtIssuedAt < changedAt;  // token issued before password change
  }
  return false;
};

module.exports = mongoose.model('User', userSchema);
