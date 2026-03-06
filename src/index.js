require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const { errorHandler } = require('./middleware/error.middleware');

const app = express();

// ─── Security & Logging ───────────────────────────────────────────
app.use(helmet());                          // Sets secure HTTP headers
app.use(morgan('dev'));                     // Request logging
app.use(express.json());                   // Parse JSON body

// ─── Routes ──────────────────────────────────────────────────────
app.use('/auth', authRoutes);              // /auth/register, /auth/login, etc.
app.use('/users', userRoutes);             // /users/me, /users/:id (protected)

// ─── Health Check ────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service', time: new Date() });
});

// ─── Error Handler (must be last) ────────────────────────────────
app.use(errorHandler);

// ─── Database & Start ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://admin:admin%40123@mongodb:27017/auth_service?authSource=admin';
console.log(MONGO_URI)
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`🚀 Auth Service running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
