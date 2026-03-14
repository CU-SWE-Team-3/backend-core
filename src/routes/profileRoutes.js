const express = require('express');
const ProfileController = require('../controllers/profileController');

const router = express.Router();

// Route: /api/v1/profiles
router.patch('/:id/privacy', ProfileController.updatePrivacy);
router.patch('/:id/social-links', ProfileController.updateSocialLinks);
router.delete('/:id/social-links/:linkId', ProfileController.removeSocialLink);
router.patch('/:id/tier', ProfileController.updateTier);

module.exports = router;
