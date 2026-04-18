const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');
const subscriptionController = require('./controllers/subscriptionController');
// const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const networkRoutes = require('./routes/networkRoutes');
const messageRoutes = require('./routes/messageRoutes'); // <--- NEW: Import message routes
const historyRouter = require('./routes/historyRoutes');

const trackRoutes = require('./routes/trackRoutes');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const playerRoutes = require('./routes/playerRoutes');
const playlistRoutes = require('./routes/playlistRoutes');

const adminRoutes = require('./routes/adminRoutes');

const globalErrorHandler = require('./middlewares/errorHandler');
const AppError = require('./utils/appError');
const commentRoutes = require('./routes/commentRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');

const app = express();
app.set('trust proxy', 1); // Add this line right after initializing app
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

app.use((req, res, next) => {
  if (req.headers['x-forwarded-for']) {
    // Takes "41.35.90.44:57064" and turns it into clean "41.35.90.44"
    req.headers['x-forwarded-for'] = req.headers['x-forwarded-for']
      .split(',')[0]
      .replace(/:\d+$/, '');
  }
  next();
});
// Limit requests from same IP (Brute Force Protection)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000000, // limit each IP to 1000 requests

  // COMPLETELY DELETE the `keyGenerator` and `validate` lines!
  // The rate limiter will just use its default, safe IP checker now.
});
app.use('/api', limiter);

// ==========================================
// THE STRIPE WEBHOOK (MUST BE ABOVE EXPRESS.JSON)
// ==========================================
// We use express.raw() here because Stripe needs the raw buffer to verify the secure signature!
app.post(
  '/api/webhook/stripe',
  express.raw({ type: 'application/json' }),
  subscriptionController.stripeWebhook // <--- Make sure this points to your actual webhook function!
);


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
app.use('/.well-known', express.static(path.join(__dirname, '.well-known')));
app.use('/api/history', historyRouter);
app.use('/api/messages', messageRoutes); // <--- NEW: Mount message routes
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

app.use('/api/tracks', trackRoutes);

app.use('/api/player', playerRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/comments', commentRoutes);

app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin', adminRoutes);
// ==========================================
// 3. UNHANDLED ROUTES (404 catch-all)
// Must come AFTER all your real routes
// ==========================================
app.all('/{*path}', (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

// ==========================================
// 4. GLOBAL ERROR HANDLER
// Must be the LAST middleware — Express identifies it by its 4 parameters
// ==========================================
app.use(globalErrorHandler);
module.exports = app;
