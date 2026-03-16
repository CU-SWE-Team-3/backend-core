const express = require('express');
const networkController = require('../controllers/networkController');

// Import your auth middleware (Make sure this matches your team's exact file/function name)
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/:userId/followers', networkController.getFollowers);
router.get('/:userId/following', networkController.getFollowing);
router.use(protect);

router.get('/feed', networkController.getFeed);

router.post('/:id/follow', networkController.followUser);

// DELETE: /api/users/:id/unfollow -> Unfollow a user
router.delete('/:id/follow', networkController.unfollowUser);

router.get('/suggested', networkController.getSuggestedUsers);
router.get('/blocked-users', networkController.getBlockedUsers);

// ==========================================
// 3.(Block / Unblock)
// ==========================================
router.post('/:userId/block', networkController.blockUser);
router.delete('/:userId/block', networkController.unblockUser);

module.exports = router;
