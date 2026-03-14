const express = require('express');
const profileController = require('../controllers/profileController');
const upload = require('../middlewares/uploadMiddleware');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// Route: /api/v1/profiles
router.patch('/:id/privacy', profileController.updatePrivacy);
router.patch('/:id/social-links', profileController.updateSocialLinks);
router.delete('/:id/social-links/:linkId', profileController.removeSocialLink);
router.patch('/:id/tier', profileController.updateTier);

// 2. Local Files Second
router.patch('/update', protect, profileController.updateProfile);

// Avatar Upload Route (protect goes first, then multer upload, then controller)
router.patch(
  '/avatar',
  protect,
  upload.single('avatar'),
  profileController.uploadAvatar
);

module.exports = router;
