const express = require('express');
const networkController = require('../controllers/networkController');
const { protect } = require('../middlewares/authMiddleware');
const { validate } = require('../validations/validationMiddleware');
const {
  followSchema,
  blockSchema,
  getUserNetworkSchema,
  getSuggestedSchema,
} = require('../validations/networkValidation');

const router = express.Router();

router.get(
  '/:userId/followers',
  validate(getUserNetworkSchema),
  networkController.getFollowers
);
router.get(
  '/:userId/following',
  validate(getUserNetworkSchema),
  networkController.getFollowing
);

router.use(protect);

router.get('/feed', networkController.getFeed);
router.get(
  '/suggested',
  validate(getSuggestedSchema),
  networkController.getSuggestedUsers
);
router.get('/blocked-users', networkController.getBlockedUsers);

router.post(
  '/:id/follow',
  validate(followSchema),
  networkController.followUser
);
router.delete(
  '/:id/follow',
  validate(followSchema),
  networkController.unfollowUser
);

router.post(
  '/:userId/block',
  validate(blockSchema),
  networkController.blockUser
);
router.delete(
  '/:userId/block',
  validate(blockSchema),
  networkController.unblockUser
);

module.exports = router;
