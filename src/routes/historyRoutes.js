const express = require('express');
const historyController = require('../controllers/historyController');
const authMiddleware = require('../middlewares/authMiddleware');
const { validate } = require('../validations/validationMiddleware');
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

module.exports = router;
