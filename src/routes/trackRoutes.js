const express = require('express');
const trackController = require('../controllers/trackController');
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

module.exports = router;
