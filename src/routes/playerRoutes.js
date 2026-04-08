// ─── playerRoutes.js ──────────────────────────────────────────────────────────
// Replace your existing src/routes/playerRoutes.js with this content.

const express = require('express');
const playerController = require('../controllers/playerController');
const authMiddleware = require('../middlewares/authMiddleware');
const { validate } = require('../validations/validationMiddleware');
const {
  getStreamSchema,
  updatePlayerStateSchema,
} = require('../validations/playerValidation');

const router = express.Router();

router.use(authMiddleware.protect);

router
  .route('/state')
  .get(playerController.getPlayerState)
  .put(validate(updatePlayerStateSchema), playerController.updatePlayerState);

router.get(
  '/:id/stream',
  validate(getStreamSchema),
  playerController.getStreamingUrl
);

module.exports = router;

// ─── NOTE ──────────────────────────────────────────────────────────────────────
// historyRoutes.js should be updated to:
//
//   const { validate } = require('../validations/validationMiddleware');
//   const { updateProgressSchema, recentlyPlayedSchema } = require('../validations/playerValidation');
//
//   router.post('/progress', validate(updateProgressSchema), historyController.updateProgress);
//   router.get('/recently-played', validate(recentlyPlayedSchema), historyController.getRecentlyPlayed);
//
// See the separate historyRoutes.js output file.
