const express = require('express');
const discoveryController = require('../controllers/discoveryController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/trending', discoveryController.getTrendingStation);
router.get('/recommended', protect, discoveryController.getStationBasedOnLikes);

// New Rule-Based Stations
router.get('/genre/:genre', discoveryController.getStationByGenre);
router.get('/artist/:artistId', discoveryController.getStationByArtist);

// 🌟 BONUS: New Discovery Features
router.get('/related/:trackId', discoveryController.getRelatedTracks);
router.get(
  '/collaborative/:trackId',
  discoveryController.getUsersWhoLikedAlsoLiked
);

module.exports = router;
