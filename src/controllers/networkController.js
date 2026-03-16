const networkService = require('../services/networkService');

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

exports.followUser = async (req, res, next) => {
  try {
    const followerId = req.user.id;
    const { userId: followingId } = req.params;

    const result = await networkService.followUser(followerId, followingId);

    res.status(200).json({
      success: true,
      data: result,
      message: 'User followed successfully',
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.unfollowUser = async (req, res, next) => {
  try {
    const followerId = req.user.id;
    const { userId: followingId } = req.params;

    const result = await networkService.unfollowUser(followerId, followingId);

    res.status(200).json({
      success: true,
      data: result,
      message: 'User unfollowed successfully',
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

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
