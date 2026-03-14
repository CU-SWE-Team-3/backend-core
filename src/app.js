const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const profileRoutes = require('./routes/profileRoutes');

const app = express();

// Global Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
console.log(process.env.NODE_ENV);

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}
// Health-Check Route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'BioBeats API is running!',
  });
});

app.use('/api/v1/profiles', profileRoutes);

module.exports = app;
