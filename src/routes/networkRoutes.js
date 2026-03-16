const express = require('express');
const networkController = require('../controllers/networkController');

// Import your auth middleware (Make sure this matches your team's exact file/function name)
const { protect } = require('../middlewares/authMiddleware'); 

const router = express.Router();

// 🔒 Apply the protect middleware to all routes below this line
// ... existing imports
router.use(protect);

// GET: /api/users/feed -> Real-time social activity feed
router.get('/feed', networkController.getFeed);

// Existing follow/unfollow routes below...

// POST: /api/users/:id/follow -> Follow a user
router.post('/:id/follow', networkController.followUser);

// DELETE: /api/users/:id/unfollow -> Unfollow a user
router.delete('/:id/unfollow', networkController.unfollowUser);


module.exports = router;
