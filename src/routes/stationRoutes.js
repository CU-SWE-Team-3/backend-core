const express = require('express');
const stationController = require('../controllers/stationController');
const { protect } = require('../middlewares/authMiddleware');
const { validate } = require('../middlewares/validationMiddleware');
const {
  likeStationSchema,
  stationIdParamSchema,
  getLikedStationsSchema,
} = require('../validations/stationValidation');

const router = express.Router();

// All station-like routes require authentication
router.use(protect);

// ── Static routes (must come before /:stationId) ──────────────────────────────

/**
 * GET /api/stations/liked
 * Returns all stations the current user has liked, with fresh tracks.
 */
router.get(
  '/liked',
  validate(getLikedStationsSchema),
  stationController.getLikedStations
);

// ── Dynamic routes ────────────────────────────────────────────────────────────

/**
 * POST   /api/stations/:stationId/like   – like a station
 * DELETE /api/stations/:stationId/like   – unlike a station
 * GET    /api/stations/:stationId/like   – check if liked
 */
router
  .route('/:stationId/like')
  .post(
    validate({ ...stationIdParamSchema, ...likeStationSchema }),
    stationController.likeStation
  )
  .delete(
    validate(stationIdParamSchema),
    stationController.unlikeStation
  )
  .get(
    validate(stationIdParamSchema),
    stationController.checkStationLiked
  );

module.exports = router;
