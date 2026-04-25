// src/routes/discoveryRoutes.js  — FULL FILE (replace existing)

const express = require('express');
const discoveryController = require('../controllers/discoveryController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// ── Existing routes (unchanged) ───────────────────────────────────────────────
router.get('/trending', discoveryController.getTrendingCharts);
router.get('/recommended', protect, discoveryController.getStationBasedOnLikes);
router.get('/genre/:genre', discoveryController.getStationByGenre);
router.get('/artist/:artistId', discoveryController.getStationByArtist);
router.get('/related/:trackId', discoveryController.getRelatedTracks);
router.get(
  '/collaborative/:trackId',
  discoveryController.getUsersWhoLikedAlsoLiked
);

// ── New routes ────────────────────────────────────────────────────────────────

// "More of what you like"
// Requires auth. Returns tracks matching the user's liked genres.
// GET /api/discovery/more-like-liked
router.get(
  '/more-like-liked',
  protect,
  discoveryController.getMoreOfWhatYouLike
);

// "Mixed for you"
// Requires auth. Returns an array of named stations built from the user's taste.
// GET /api/discovery/mixed-for-you
router.get('/mixed-for-you', protect, discoveryController.getMixedForYou);

// "Curated by platform"
// Public — no auth needed. Returns themed editorial track buckets.
// GET /api/discovery/curated
router.get('/curated', discoveryController.getCuratedByPlatform);

module.exports = router;
