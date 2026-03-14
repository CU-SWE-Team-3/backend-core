const express = require('express');
const profileController = require('../controllers/profileController');
const upload = require('../middlewares/uploadMiddleware');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// Route: /api/v1/profiles
router.patch('/privacy', protect, profileController.updatePrivacy);
router.patch('/social-links', protect, profileController.updateSocialLinks);
router.delete(
  '/social-links/:linkId',
  protect,
  profileController.removeSocialLink
);
router.patch('/tier', protect, profileController.updateTier);

// 2. Local Files Second
router.patch('/update', protect, profileController.updateProfile);

// Avatar Upload Route (protect goes first, then multer upload, then controller)
router.patch(
  '/upload-images',
  protect,
  // NEW: We tell Multer to accept up to 1 avatar AND up to 1 cover simultaneously!
  upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  profileController.uploadProfileImages
);

module.exports = router;
