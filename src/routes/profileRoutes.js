const express = require('express');
const profileController = require('../controllers/profileController');
const upload = require('../middlewares/uploadMiddleware');
const { protect } = require('../middlewares/authMiddleware');
const interactionController = require('../controllers/interactionController');

const router = express.Router();

router.patch('/privacy', protect, profileController.updatePrivacy);
router.patch('/social-links', protect, profileController.updateSocialLinks);
router.delete(
  '/social-links/:linkId',
  protect,
  profileController.removeSocialLink
);
router.patch('/tier', protect, profileController.updateTier);

router.get('/:userId/reposts', interactionController.getUserRepostsFeed);

router.get('/:permalink', profileController.getProfileByPermalink);
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
