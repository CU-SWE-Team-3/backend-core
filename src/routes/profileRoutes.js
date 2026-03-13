// 1. Third-Party Packages First
const express = require('express');

// 2. Local Files Second
const profileController = require('../controllers/profileController');
const upload = require('../middlewares/uploadMiddleware');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.patch('/update', protect, profileController.updateProfile);

// Avatar Upload Route (protect goes first, then multer upload, then controller)
router.patch(
  '/avatar',
  protect,
  upload.single('avatar'),
  profileController.uploadAvatar
);

module.exports = router;
