const express = require('express');
const trackController = require('../controllers/trackController');
const interactionController = require('../controllers/interactionController');
const { protect, optionalAuth } = require('../middlewares/authMiddleware');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const commentController = require('../controllers/commentController');
const searchController = require('../controllers/searchController');
const trendingController = require('../controllers/trendingController');
const { validate } = require('../middlewares/validationMiddleware');
const {
  initiateUploadSchema,
  confirmUploadSchema,
  updateMetadataSchema,
  updateVisibilitySchema,
  getTrackSchema,
  trackIdParamSchema,
} = require('../validations/trackValidation');
const {
  trackInteractionSchema,
  trackEngagersSchema,
  createCommentSchema,
  getCommentsSchema,
} = require('../validations/interactionValidation');

const router = express.Router();

// ── trending ──────────────────────────────────────────────────────

router.get('/trending', trendingController.getTrendingCharts);

// ── Metadata & Visibility ──────────────────────────────────────────────────────
router.patch(
  '/:id/metadata',
  protect,
  validate(updateMetadataSchema),
  trackController.updateMetadata
);
router.patch(
  '/:id/visibility',
  protect,
  validate(updateVisibilitySchema),
  trackController.updateVisibility
);
router.patch(
  '/:id/artwork',
  protect,
  uploadMiddleware.single('artwork'),
  trackController.uploadArtwork
);

// ── Upload Pipeline ────────────────────────────────────────────────────────────
router.post(
  '/upload',
  protect,
  validate(initiateUploadSchema),
  trackController.initiateUpload
);
router.patch(
  '/:id/confirm',
  protect,
  validate(confirmUploadSchema),
  trackController.confirmUpload
);
router.get('/my-tracks', protect, trackController.getMyTracks);

// ── Search & Discovery (Module 8) ──────────────────────────────────────────────
router.get('/autocomplete', searchController.autocomplete);
router.get('/search', optionalAuth, searchController.globalSearch);

// ── Fetch & Stream ─────────────────────────────────────────────────────────────
router.get(
  '/:permalink',
  optionalAuth,
  validate(getTrackSchema),
  trackController.getTrack
);

// ── Download & Delete ──────────────────────────────────────────────────────────
router.get(
  '/:id/download',
  protect,
  validate(trackIdParamSchema),
  trackController.downloadTrack
);
router.delete(
  '/:id',
  protect,
  validate(trackIdParamSchema),
  trackController.deleteTrack
);

// ── Interactions (Module 6) ────────────────────────────────────────────────────
router.post(
  '/:id/repost',
  protect,
  validate(trackInteractionSchema),
  interactionController.createRepost
);
router.delete(
  '/:id/repost',
  protect,
  validate(trackInteractionSchema),
  interactionController.deleteRepost
);
router.get(
  '/:id/reposters',
  validate(trackEngagersSchema),
  interactionController.getTrackReposters
);
router.get(
  '/:id/likers',
  validate(trackEngagersSchema),
  interactionController.getTrackLikers
);

router.post(
  '/:id/like',
  protect,
  validate(trackInteractionSchema),
  interactionController.createLike
);
router.delete(
  '/:id/like',
  protect,
  validate(trackInteractionSchema),
  interactionController.deleteLike
);

// ── Comments (Module 6) ────────────────────────────────────────────────────────
router.post(
  '/:trackId/comments',
  protect,
  validate(createCommentSchema),
  commentController.createComment
);
router.get(
  '/:trackId/comments',
  validate(getCommentsSchema),
  commentController.getTrackComments
);

module.exports = router;
