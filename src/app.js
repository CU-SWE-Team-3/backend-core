const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
// const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const networkRoutes = require('./routes/networkRoutes');

const trackRoutes = require('./routes/trackRoutes');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');

const app = express();
app.set('trust proxy', 1);

// ==========================================
// 1. GLOBAL MIDDLEWARES & SECURITY
// ==========================================
// Set security HTTP headers
app.use(helmet());

// Enable CORS (Cross-Origin Resource Sharing)
app.use(
  cors({
    origin: `${process.env.FRONTEND_URL}`, // Your frontend URL
    credentials: true, // THIS IS THE KEY: Allows cookies to be sent/received
  })
);

// Development logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Limit requests from same IP (Brute Force Protection)
const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many requests from this IP, please try again in an hour!',
});
app.use('/api', limiter);

// Body parser, reading data from body into req.body (Prevents large payload attacks)
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser()); // <--- NEW: Allows Express to read incoming cookies

app.use((req, res, next) => {
  const queryClone = {};
  Object.keys(req.query || {}).forEach((key) => {
    queryClone[key] = req.query[key];
  });
  Object.defineProperty(req, 'query', {
    value: queryClone,
    writable: true,
    configurable: true,
    enumerable: true,
  });
  next();
});
// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Prevent parameter pollution
// app.use(
//   hpp({
//     whitelist: [
//       // We will add sort/filter fields here later (e.g., 'genre', 'duration')
//     ],
//   })
// );

// ==========================================
// 2. ROUTES
// ==========================================
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'BioBeats API is highly secure and running!',
  });
});

app.use('/api/auth', authRoutes);
// This means all relationship routes will start with /api/users
app.use('/api/network', networkRoutes);

app.use('/api/profile', profileRoutes);

app.use('/api/network', networkRoutes);

app.use('/api/tracks', trackRoutes);
module.exports = app;
