const express = require('express');
const historyController = require('../controllers/historyController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// Protect all history routes - users must be logged in to track or view history
router.use(authMiddleware.protect);

// Route to update playback progress
router.post('/progress', historyController.updateProgress);

// Route to fetch recently played tracks
router.get('/recently-played', historyController.getRecentlyPlayed);

module.exports = router;
