const express = require('express');
const trackController = require('../controllers/trackController');
const interactionController = require('../controllers/interactionController');
const { protect } = require('../middlewares/authMiddleware'); // Make sure this path matches your auth middleware
const uploadMiddleware = require('../middlewares/uploadMiddleware');

const router = express.Router();

// ==========================================
// BE-3: METADATA & VISIBILITY ROUTES
// ==========================================

/**
 * @route   PATCH /api/tracks/:id/metadata
 * @desc    Update track metadata
 * @access  Private
 */
router.patch('/:id/metadata', protect, trackController.updateMetadata);

/**
 * @route   PATCH /api/tracks/:id/visibility
 * @desc    Toggle track visibility
 * @access  Private
 */
router.patch('/:id/visibility', protect, trackController.updateVisibility);
/**
 * @route   PATCH /api/tracks/:id/artwork
 * @desc    Upload track cover photo
 * @access  Private
 */
router.patch(
  '/:id/artwork',
  protect,
  uploadMiddleware.single('artwork'),
  trackController.uploadArtwork
);

// 1. Direct-to-Cloud Upload Pipeline
router.post('/upload', protect, trackController.initiateUpload);
router.patch('/:id/confirm', protect, trackController.confirmUpload);
router.get('/my-tracks', protect, trackController.getMyTracks);

// 2. Fetch & Stream (Public)
router.get('/:permalink', trackController.getTrack);

// 3. Premium Offline Download (Protected)
router.get('/:id/download', protect, trackController.downloadTrack);

// 4. Delete Track (Protected - Owner only)
router.delete('/:id', protect, trackController.deleteTrack);

// Hossam's Module 6 Routes
router.post('/:id/repost', protect, interactionController.createRepost);
router.delete('/:id/repost', protect, interactionController.deleteRepost);

router.get('/:id/reposters', interactionController.getTrackReposters);
router.get('/:id/likers', interactionController.getTrackLikers);

module.exports = router;
