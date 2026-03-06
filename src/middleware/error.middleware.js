exports.errorHandler = (err, req, res, next) => {
  console.error('Error:', err.message);

  // Mongoose duplicate key (e.g. email already exists)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({ error: `${field} already in use` });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: messages.join(', ') });
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  // Default
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
};
