const networkService = require('../services/networkService');

exports.followUser = async (req, res) => {
  try {
    // 1. Get the logged-in user's ID from the Auth Middleware
    const followerId = req.user._id || req.user.id; 
    
    // 2. Get the target user's ID from the URL (e.g., /api/users/123/follow)
    const followingId = req.params.id;

    await networkService.followUser(followerId, followingId);
    
    res.status(200).json({ success: true, message: 'Successfully followed user.' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.unfollowUser = async (req, res) => {
  try {
    const followerId = req.user._id || req.user.id;
    const followingId = req.params.id;

    await networkService.unfollowUser(followerId, followingId);
    
    res.status(200).json({ success: true, message: 'Successfully unfollowed user.' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};


exports.getFeed = async (req, res) => {
  try {
    const userId = req.user._id; // Get the logged-in user from the 'protect' middleware
    const feed = await networkService.getUserFeed(userId);
    
    res.status(200).json({
      success: true,
      count: feed.length,
      data: feed
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
};
