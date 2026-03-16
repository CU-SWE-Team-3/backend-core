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
exports.getFollowers = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { page, limit } = req.query;
    const followers = await networkService.getFollowers(
      userId,
      parseInt(page, 10),
      parseInt(limit, 10)
    );
    res
      .status(200)
      .json({ success: true, data: followers, message: 'Followers retrieved' });
  } catch (error) {
    next(error); // Passes to Express default error handler for now
  }
};

exports.getFollowing = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { page, limit } = req.query;
    const following = await networkService.getFollowing(
      userId,
      parseInt(page, 10),
      parseInt(limit, 10)
    );
    res
      .status(200)
      .json({ success: true, data: following, message: 'Following retrieved' });
  } catch (error) {
    next(error);
  }
};

exports.getSuggestedUsers = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;

    // Extract page and limit from the URL, default to page 1 and limit 10
    const { page = 1, limit = 10 } = req.query;

    const suggested = await networkService.getSuggestedUsers(
      currentUserId,
      parseInt(page, 10),
      parseInt(limit, 10)
    );

    res.status(200).json({
      success: true,
      results: suggested.length,
      data: suggested,
      message: 'Suggested users retrieved',
    });
  } catch (error) {
    next(error);
  }
};

exports.getBlockedUsers = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const blockedUsers = await networkService.getBlockedUsers(userId);
    res.status(200).json({
      success: true,
      data: blockedUsers,
      message: 'Blocked users retrieved',
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// New Separate Controllers
// ==========================================

exports.blockUser = async (req, res, next) => {
  try {
    const blockerId = req.user.id;
    const { userId: blockedId } = req.params;

    const result = await networkService.blockUser(blockerId, blockedId);

    res.status(200).json({
      success: true,
      data: result,
      message: 'User blocked successfully',
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.unblockUser = async (req, res, next) => {
  try {
    const blockerId = req.user.id;
    const { userId: blockedId } = req.params;

    const result = await networkService.unblockUser(blockerId, blockedId);

    res.status(200).json({
      success: true,
      data: result,
      message: 'User unblocked successfully',
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
