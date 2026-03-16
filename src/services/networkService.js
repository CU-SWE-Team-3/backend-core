const Follow = require('../models/followModel');
const User = require('../models/userModel');
const Block = require('../models/blockModel');

exports.followUser = async (followerId, followingId) => {
  if (followerId.toString() === followingId.toString()) {
    throw new Error('You cannot follow yourself.');
  }

  const userToFollow = await User.findById(followingId);
  if (!userToFollow) {
    throw new Error('User not found.');
  }

  const existingFollow = await Follow.findOne({
    follower: followerId,
    following: followingId,
  });

  if (existingFollow) {
    throw new Error('You are already following this user.');
  }

  const follow = await Follow.create({
    follower: followerId,
    following: followingId,
  });

  await User.findByIdAndUpdate(followerId, { $inc: { followingCount: 1 } });
  await User.findByIdAndUpdate(followingId, { $inc: { followerCount: 1 } });

  return follow;
};

exports.unfollowUser = async (followerId, followingId) => {
  const follow = await Follow.findOneAndDelete({
    follower: followerId,
    following: followingId,
  });

  if (!follow) {
    throw new Error('You are not following this user.');
  }

  await User.findByIdAndUpdate(followerId, { $inc: { followingCount: -1 } });
  await User.findByIdAndUpdate(followingId, { $inc: { followerCount: -1 } });

  return { message: 'Unfollowed successfully' };
};


// auomatically generate feed for user based on who they follow
exports.getUserFeed = async (userId) => {
  // 1. Find the IDs of everyone the user follows
  const followingRels = await Follow.find({ follower: userId });
  const followingIds = followingRels.map(rel => rel.following);

  if (followingIds.length === 0) {
    return []; // Return empty if following no one
  }

  // 2. Find the users in that list and sort by their most recent activity/update
  const feed = await User.find({ _id: { $in: followingIds } })
    .select('_id displayName avatarUrl permalink bio updatedAt')
    .sort({ updatedAt: -1 }) // Newest updates at the top
    .limit(10);

  return feed;
};


exports.getFollowers = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const followers = await Follow.find({ following: userId })
    .populate('follower', 'displayName permalink avatarUrl role isPremium')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  return followers.map((f) => f.follower);
};

exports.getFollowing = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const following = await Follow.find({ follower: userId })
    .populate('following', 'displayName permalink avatarUrl role isPremium')
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
      { $limit: parseInt(limit) },
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
    throw new Error('You cannot block yourself');
  }

  const existingBlock = await Block.findOne({
    blocker: blockerId,
    blocked: blockedId,
  });

  if (existingBlock) {
    throw new Error('User is already blocked');
  }

  await Block.create({ blocker: blockerId, blocked: blockedId });

  await Follow.deleteMany({
    $or: [
      { follower: blockerId, following: blockedId },
      { follower: blockedId, following: blockerId },
    ],
  });
  // Note: BE-1 will need to update the User follower/following counts here later.

  return { status: 'blocked' };
};

exports.unblockUser = async (blockerId, blockedId) => {
  const existingBlock = await Block.findOne({
    blocker: blockerId,
    blocked: blockedId,
  });

  if (!existingBlock) {
    throw new Error('User is not blocked');
  }

  await Block.findByIdAndDelete(existingBlock._id);

  return { status: 'unblocked' };
};
