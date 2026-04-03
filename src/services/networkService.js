const Follow = require('../models/followModel');
const User = require('../models/userModel');
const Block = require('../models/blockModel');
const AppError = require('../utils/appError');
const Track = require('../models/trackModel');

exports.followUser = async (followerId, followingId) => {
  if (followerId.toString() === followingId.toString()) {
    throw new Error('You cannot follow yourself.');
  }

  const userToFollow = await User.findById(followingId);
  if (!userToFollow) throw new Error('User not found.');

  // ==========================================
  // NEW: Check if there is a block in EITHER direction
  // ==========================================
  const existingBlock = await Block.findOne({
    $or: [
      { blocker: followerId, blocked: followingId }, // You blocked them
      { blocker: followingId, blocked: followerId }, // They blocked you
    ],
  });

  if (existingBlock) {
    // Using AppError to return a proper 403 Forbidden status
    throw new AppError(
      'You cannot follow this user due to an active block.',
      403
    );
  }
  // ==========================================

  const existingFollow = await Follow.findOne({
    follower: followerId,
    following: followingId,
  });

  if (existingFollow) throw new Error('You are already following this user.');

  await Follow.create({ follower: followerId, following: followingId });

  const [follower, following] = await Promise.all([
    User.findByIdAndUpdate(
      followerId,
      { $inc: { followingCount: 1 } },
      { new: true }
    ).select('followingCount'),
    User.findByIdAndUpdate(
      followingId,
      { $inc: { followerCount: 1 } },
      { new: true }
    ).select('followerCount'),
  ]);

  return {
    // counts for the logged-in user (followerId)
    myFollowingCount: follower.followingCount,
    // counts for the target user (followingId)
    theirFollowerCount: following.followerCount,
  };
};

// FIX: same — returns updated counts after unfollow
exports.unfollowUser = async (followerId, followingId) => {
  const follow = await Follow.findOneAndDelete({
    follower: followerId,
    following: followingId,
  });
  if (!follow) throw new Error('You are not following this user.');

  const [follower, following] = await Promise.all([
    User.findByIdAndUpdate(
      followerId,
      { $inc: { followingCount: -1 } },
      { new: true }
    ).select('followingCount'),
    User.findByIdAndUpdate(
      followingId,
      { $inc: { followerCount: -1 } },
      { new: true }
    ).select('followerCount'),
  ]);

  return {
    myFollowingCount: follower.followingCount,
    theirFollowerCount: following.followerCount,
  };
};

// FIX: returns recent tracks from followed artists — not user profiles
// This is what a music feed is: content, not people
exports.getUserFeed = async (userId) => {
  const followingRels = await Follow.find({ follower: userId });
  const followingIds = followingRels.map((rel) => rel.following);

  if (followingIds.length === 0) return [];

  const feed = await Track.find({
    artist: { $in: followingIds },
    isPublic: true,
    processingState: 'Finished',
  })
    .populate('artist', 'displayName permalink avatarUrl')
    .select(
      'title permalink artworkUrl hlsUrl waveform duration genre artist playCount likeCount createdAt'
    )
    .sort({ createdAt: -1 })
    .limit(20);

  return feed;
};

exports.getFollowers = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const followers = await Follow.find({ following: userId })
    .populate(
      'follower',
      'displayName permalink avatarUrl role isPremium followerCount followingCount'
    )
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  return followers.map((f) => f.follower);
};

exports.getFollowing = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const following = await Follow.find({ follower: userId })
    .populate(
      'following',
      'displayName permalink avatarUrl role isPremium followerCount followingCount'
    )
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  return following.map((f) => f.following);
};

exports.getSuggestedUsers = async (currentUserId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const followingDocs = await Follow.find({ follower: currentUserId }).select(
    'following'
  );
  const followingIds = followingDocs.map((doc) => doc.following);

  const blockDocs = await Block.find({
    $or: [{ blocker: currentUserId }, { blocked: currentUserId }],
  });
  const blockedIds = blockDocs.map((doc) =>
    doc.blocker.toString() === currentUserId.toString()
      ? doc.blocked
      : doc.blocker
  );

  const excludedIds = [currentUserId, ...followingIds, ...blockedIds];

  let suggestedUsers = [];

  if (followingIds.length > 0) {
    const mutualFollows = await Follow.aggregate([
      {
        $match: {
          follower: { $in: followingIds },
          following: { $nin: excludedIds },
        },
      },
      {
        $group: {
          _id: '$following',
          mutualCount: { $sum: 1 },
        },
      },
      { $sort: { mutualCount: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit, 10) },
    ]);

    if (mutualFollows.length > 0) {
      const mutualIds = mutualFollows.map((m) => m._id);
      suggestedUsers = await User.find({
        _id: { $in: mutualIds },
        accountStatus: 'Active',
      }).select('displayName permalink avatarUrl followerCount role');
    }
  }

  // 5. (Fallback to Popularity)
  if (suggestedUsers.length < limit) {
    const remainingLimit = limit - suggestedUsers.length;

    const newExcludedIds = [
      ...excludedIds,
      ...suggestedUsers.map((u) => u._id),
    ];

    const popularUsers = await User.find({
      _id: { $nin: newExcludedIds },
      accountStatus: 'Active',
    })
      .select('displayName permalink avatarUrl followerCount role')
      .sort({ followerCount: -1 })
      .skip(skip)
      .limit(remainingLimit);

    suggestedUsers = [...suggestedUsers, ...popularUsers];
  }

  return suggestedUsers;
};

exports.getBlockedUsers = async (userId) => {
  const blocks = await Block.find({ blocker: userId })
    .populate('blocked', 'displayName permalink avatarUrl')
    .sort({ createdAt: -1 });

  return blocks.map((b) => b.blocked);
};

// ==========================================
// New Separate Actions (Block/Unblock)
// ==========================================

exports.blockUser = async (blockerId, blockedId) => {
  if (blockerId.toString() === blockedId.toString()) {
    throw new AppError('You cannot block yourself', 400);
  }

  // 1. Check if block already exists
  const existingBlock = await Block.findOne({
    blocker: blockerId,
    blocked: blockedId,
  });

  if (existingBlock) {
    throw new AppError('User is already blocked', 409);
  }

  // 2. Create the block
  await Block.create({ blocker: blockerId, blocked: blockedId });

  // 3. Delete follow relationships and check if they existed
  // Did the blocker follow the blocked user?
  const followBlockerToBlocked = await Follow.findOneAndDelete({
    follower: blockerId,
    following: blockedId,
  });

  // Did the blocked user follow the blocker?
  const followBlockedToBlocker = await Follow.findOneAndDelete({
    follower: blockedId,
    following: blockerId,
  });

  // 4. Prepare count decrements safely
  const blockerInc = {};
  const blockedInc = {};

  if (followBlockerToBlocked) {
    // Blocker unfollowed Blocked -> Blocker's following decreases, Blocked's followers decrease
    blockerInc.followingCount = -1;
    blockedInc.followerCount = -1;
  }

  if (followBlockedToBlocker) {
    // Blocked unfollowed Blocker -> Blocker's followers decrease, Blocked's following decreases
    blockerInc.followerCount = (blockerInc.followerCount || 0) - 1;
    blockedInc.followingCount = (blockedInc.followingCount || 0) - 1;
  }

  // 5. Apply updates to the User models concurrently
  const updatePromises = [];

  if (Object.keys(blockerInc).length > 0) {
    updatePromises.push(
      User.findByIdAndUpdate(blockerId, { $inc: blockerInc })
    );
  }

  if (Object.keys(blockedInc).length > 0) {
    updatePromises.push(
      User.findByIdAndUpdate(blockedId, { $inc: blockedInc })
    );
  }

  if (updatePromises.length > 0) {
    await Promise.all(updatePromises);
  }

  return { status: 'blocked' };
};

exports.unblockUser = async (blockerId, blockedId) => {
  const existingBlock = await Block.findOne({
    blocker: blockerId,
    blocked: blockedId,
  });

  if (!existingBlock) {
    throw new AppError('User is not blocked', 404);
  }

  await Block.findByIdAndDelete(existingBlock._id);

  return { status: 'unblocked' };
};

exports.unblockUser = async (blockerId, blockedId) => {
  const existingBlock = await Block.findOne({
    blocker: blockerId,
    blocked: blockedId,
  });

  if (!existingBlock) {
    throw new AppError('User is not blocked', 404);
  }

  await Block.findByIdAndDelete(existingBlock._id);

  return { status: 'unblocked' };
};
