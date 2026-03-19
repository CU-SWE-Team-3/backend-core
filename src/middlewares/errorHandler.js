const AppError = require('../utils/appError');

// ==========================================
// SPECIFIC ERROR HANDLERS
// ==========================================

/** Mongoose: Invalid ObjectId (e.g. /api/tracks/not-a-valid-id) */
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

/** Mongoose: Duplicate unique field (e.g. email already exists) */
const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const message = `Duplicate field value: "${value}" for field "${field}". Please use a different value.`;
  return new AppError(message, 400);
};

/** Mongoose: Schema validation failed */
const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Validation failed: ${errors.join('. ')}`;
  return new AppError(message, 400);
};

/** JWT: Token is invalid or tampered */
const handleJWTError = () =>
  new AppError('Invalid token. Please log in again.', 401);

/** JWT: Token has expired */
const handleJWTExpiredError = () =>
  new AppError('Your session has expired. Please log in again.', 401);

// ==========================================
// RESPONSE SENDERS
// ==========================================

/** Development: Send full error details for debugging */
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

/** Production: Send only safe, user-facing error info */
const sendErrorProd = (err, res) => {
  // Operational error (known, thrown intentionally) — safe to expose
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
    });
  }

  // Programming or unknown error — don't leak details
  console.error('💥 UNEXPECTED ERROR:', err);
  return res.status(500).json({
    success: false,
    status: 'error',
    message: 'Something went wrong. Please try again later.',
  });
};

// ==========================================
// GLOBAL ERROR HANDLER MIDDLEWARE
// Must have 4 parameters so Express recognises it as an error handler
// ==========================================
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err, message: err.message, name: err.name };

    // Transform known Mongoose/JWT errors into clean AppErrors
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError')
      error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, res);
  }
};

module.exports = globalErrorHandler;
