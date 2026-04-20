const express = require('express');
const historyController = require('../controllers/historyController');
const authMiddleware = require('../middlewares/authMiddleware');
const { validate } = require('../middlewares/validationMiddleware');
const {
  updateProgressSchema,
  recentlyPlayedSchema,
} = require('../validations/playerValidation');

const router = express.Router();

router.use(authMiddleware.protect);

router.post(
  '/progress',
  validate(updateProgressSchema),
  historyController.updateProgress
);

router.get(
  '/recently-played',
  validate(recentlyPlayedSchema),
  historyController.getRecentlyPlayed
);

router.get(
  '/recently-played-playlists',
  validate(recentlyPlayedSchema),
  historyController.getRecentlyPlayedPlaylists
);

router.get('/recently-played-mixed', historyController.getRecentlyPlayedMixed);

router.delete('/', historyController.clearHistory);

module.exports = router;
