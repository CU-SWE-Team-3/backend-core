const express = require('express');
const profileController = require('../controllers/profileController');
const upload = require('../middlewares/uploadMiddleware');
const { protect } = require('../middlewares/authMiddleware');
const interactionController = require('../controllers/interactionController');
const { validate } = require('../validations/validationMiddleware');
const {
  updateProfileSchema,
  updatePrivacySchema,
  updateSocialLinksSchema,
  removeSocialLinkSchema,
  updateTierSchema,
} = require('../validations/profileValidation');
const {
  userEngagementFeedSchema,
} = require('../validations/interactionValidation');

const router = express.Router();

router.patch(
  '/privacy',
  protect,
  validate(updatePrivacySchema),
  profileController.updatePrivacy
);
router.patch(
  '/social-links',
  protect,
  validate(updateSocialLinksSchema),
  profileController.updateSocialLinks
);
router.delete(
  '/social-links/:linkId',
  protect,
  validate(removeSocialLinkSchema),
  profileController.removeSocialLink
);
router.patch(
  '/tier',
  protect,
  validate(updateTierSchema),
  profileController.updateTier
);

router.get(
  '/:userId/reposts',
  validate(userEngagementFeedSchema),
  interactionController.getUserRepostsFeed
);
router.get(
  '/:userId/likes',
  validate(userEngagementFeedSchema),
  interactionController.getUserLikesFeed
);

router.get('/:permalink', profileController.getProfileByPermalink);
router.patch(
  '/update',
  protect,
  validate(updateProfileSchema),
  profileController.updateProfile
);

router.patch(
  '/upload-images',
  protect,
  upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  profileController.uploadProfileImages
);

module.exports = router;
