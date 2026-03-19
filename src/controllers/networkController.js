const networkService = require('../services/networkService');
const catchAsync = require('../utils/catchAsync');

exports.followUser = catchAsync(async (req, res, next) => {
  const followerId = req.user._id || req.user.id;
  const followingId = req.params.id;

  const counts = await networkService.followUser(followerId, followingId);

  res.status(200).json({
    success: true,
    message: 'Successfully followed user.',
    data: counts,
  });
});

// FIX: unfollow also returns updated counts
exports.unfollowUser = catchAsync(async (req, res, next) => {
  const followerId = req.user._id || req.user.id;
  const followingId = req.params.id;

  const counts = await networkService.unfollowUser(followerId, followingId);

  res.status(200).json({
    success: true,
    message: 'Successfully unfollowed user.',
    data: counts,
  });
});

// FIX: feed now returns tracks from followed artists, not user profiles
exports.getFeed = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const feed = await networkService.getUserFeed(userId);

  res.status(200).json({
    success: true,
    count: feed.length,
    data: feed,
  });
});
exports.getFollowers = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { page, limit } = req.query;
  const followers = await networkService.getFollowers(
    userId,
    parseInt(page, 10),
    parseInt(limit, 10)
  );

  res.status(200).json({
    success: true,
    count: followers.length,
    data: followers,
  });
});

exports.getFollowing = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { page, limit } = req.query;
  const following = await networkService.getFollowing(
    userId,
    parseInt(page, 10),
    parseInt(limit, 10)
  );

  res.status(200).json({
    success: true,
    count: following.length,
    data: following,
  });
});

// FIX: changed results -> count, removed duplicate message field to match other list endpoints
exports.getSuggestedUsers = catchAsync(async (req, res, next) => {
  const currentUserId = req.user.id;
  const { page = 1, limit = 10 } = req.query;

  const suggested = await networkService.getSuggestedUsers(
    currentUserId,
    parseInt(page, 10),
    parseInt(limit, 10)
  );

  res.status(200).json({
    success: true,
    count: suggested.length,
    data: suggested,
  });
});

exports.getBlockedUsers = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const blockedUsers = await networkService.getBlockedUsers(userId);

  res.status(200).json({
    success: true,
    count: blockedUsers.length,
    data: blockedUsers,
  });
});

// ==========================================
// New Separate Controllers
// ==========================================

exports.blockUser = catchAsync(async (req, res) => {
  const blockerId = req.user.id;
  const { userId: blockedId } = req.params;

  const result = await networkService.blockUser(blockerId, blockedId);

  res.status(200).json({
    success: true,
    data: result,
    message: 'User blocked successfully',
  });
});

exports.unblockUser = catchAsync(async (req, res) => {
  const blockerId = req.user.id;
  const { userId: blockedId } = req.params;

  const result = await networkService.unblockUser(blockerId, blockedId);

  res.status(200).json({
    success: true,
    data: result,
    message: 'User unblocked successfully',
  });
});
