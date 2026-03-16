const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const networkController = require('../controllers/networkController');

const router = express.Router();


router.get('/:userId/followers', networkController.getFollowers);
router.get('/:userId/following', networkController.getFollowing);
router.use(protect);


router.get('/suggested', networkController.getSuggestedUsers);
router.get('/blocked-users', networkController.getBlockedUsers);

// ==========================================
// 3.(Block / Unblock)
// ==========================================
router.post('/:userId/block', networkController.blockUser);
router.delete('/:userId/block', networkController.unblockUser);

module.exports = router;
