const express = require('express');
const relationshipController = require('../controllers/relationshipController');

// Import your auth middleware (Make sure this matches your team's exact file/function name)
const { protect } = require('../middlewares/authMiddleware'); 

const router = express.Router();

// 🔒 Apply the protect middleware to all routes below this line
router.use(protect);
// ... existing imports
router.use(protect);

// GET: /api/users/feed -> Real-time social activity feed
router.get('/feed', relationshipController.getFeed);

// Existing follow/unfollow routes below...

// POST: /api/users/:id/follow -> Follow a user
router.post('/:id/follow', relationshipController.followUser);

// DELETE: /api/users/:id/unfollow -> Unfollow a user
router.delete('/:id/unfollow', relationshipController.unfollowUser);


// ... existing code ...
// router.delete('/:id/unfollow', relationshipController.unfollowUser);

// --- ADD THESE NEW ROUTES ---
// GET: /api/users/:id/followers -> Get a user's followers list
router.get('/:id/followers', relationshipController.getFollowers);

// GET: /api/users/:id/following -> Get who a user is following
router.get('/:id/following', relationshipController.getFollowing);

module.exports = router;





module.exports = router;