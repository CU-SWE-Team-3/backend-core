const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const networkController = require('../controllers/networkController');

const router = express.Router();

// تفعيل حماية المسارات (يجب تسجيل الدخول) على كل الروابط اللي تحت

router.get('/:userId/followers', networkController.getFollowers);
router.get('/:userId/following', networkController.getFollowing);
router.use(protect);

// ==========================================
// 1. مسارات العرض والقوائم (GET)
// ==========================================
router.get('/suggested', networkController.getSuggestedUsers);
router.get('/blocked-users', networkController.getBlockedUsers);

// ==========================================
// 2. مسارات المتابعة وإلغاء المتابعة (Follow / Unfollow)
// ==========================================
router.post('/:userId/follow', networkController.followUser);
router.delete('/:userId/follow', networkController.unfollowUser);

// ==========================================
// 3. مسارات الحظر وإلغاء الحظر (Block / Unblock)
// ==========================================
router.post('/:userId/block', networkController.blockUser);
router.delete('/:userId/block', networkController.unblockUser);

module.exports = router;
