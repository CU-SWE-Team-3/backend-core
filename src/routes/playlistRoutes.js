// src/routes/playlistRoutes.js
const express = require('express');
const playlistController = require('../controllers/playlistController');
const { protect, optionalAuth } = require('../middlewares/authMiddleware');
const { validate } = require('../validations/validationMiddleware');

// 👇 Import your multer middleware
// Adjust the file name if it's named 'upload.middleware.js' in your folder!
const upload = require('../middlewares/uploadMiddleware');

const {
  playlistIdParamSchema,
  createPlaylistSchema,
  updatePlaylistSchema,
  updateTracksSchema,
} = require('../validations/playlistValidation');

const router = express.Router();

// 1. Create a playlist (Requires Auth)
router.post(
  '/',
  protect,
  validate(createPlaylistSchema),
  playlistController.createPlaylist
);

// 2. Get a playlist / Handles Secret Token (Public / Optional Auth)
router.get(
  '/:id',
  optionalAuth,
  validate(playlistIdParamSchema),
  playlistController.getPlaylist
);

// 3. Update playlist metadata (Requires Auth)
router.patch(
  '/:id',
  protect,
  validate(updatePlaylistSchema),
  playlistController.updatePlaylist
);

// 4. Delete a playlist (Requires Auth)
router.delete(
  '/:id',
  protect,
  validate(playlistIdParamSchema),
  playlistController.deletePlaylist
);

// 5. Track Sequencing - update tracks array (Requires Auth)
router.put(
  '/:id/tracks',
  protect,
  validate(updateTracksSchema),
  playlistController.updateTracks
);

// 6. Get Embed Code (Public / Optional Auth)
router.get(
  '/:id/embed',
  optionalAuth,
  validate(playlistIdParamSchema),
  playlistController.getEmbedCode
);

// 8. Upload Custom Artwork (Requires Auth)
// We use upload.single('artwork') to look for the file attached to the 'artwork' field
router.patch(
  '/:id/artwork',
  protect,
  validate(playlistIdParamSchema),
  upload.single('artwork'),
  playlistController.uploadArtwork
);

module.exports = router;
