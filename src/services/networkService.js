const Follow = require('../models/followModel');
const Block = require('../models/blockModel');
const User = require('../models/userModel');

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
  // 0. حساب عدد اليوزرز اللي هنتخطاهم بناءً على رقم الصفحة
  const skip = (page - 1) * limit;

  // 1. هنجيب الناس اللي اليوزر بيتابعهم (عشان نستخدمهم في البحث عن المشتركين)
  const followingDocs = await Follow.find({ follower: currentUserId }).select(
    'following'
  );
  const followingIds = followingDocs.map((doc) => doc.following);

  // 2. هنجيب الناس اللي معمولهم بلوك
  const blockDocs = await Block.find({
    $or: [{ blocker: currentUserId }, { blocked: currentUserId }],
  });
  const blockedIds = blockDocs.map((doc) =>
    doc.blocker.toString() === currentUserId.toString()
      ? doc.blocked
      : doc.blocker
  );

  // 3. قايمة الاستبعاد (أنا + اللي بتابعهم + البلوك)
  const excludedIds = [currentUserId, ...followingIds, ...blockedIds];

  let suggestedUsers = [];

  // 4. الذكاء الاصطناعي المبسط (Mutual Followers)
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
      { $skip: skip }, // <--- أضفنا التخطي هنا
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

  // 5. الخطة البديلة (Fallback to Popularity)
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
      .sort({ followerCount: -1 }) // الأشهر
      .skip(skip) // <--- أضفنا التخطي هنا
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
// New Separate Actions (Follow/Unfollow/Block/Unblock)
// ==========================================

exports.followUser = async (followerId, followingId) => {
  if (followerId.toString() === followingId.toString()) {
    throw new Error('You cannot follow yourself');
  }

  // نتأكد إن مفيش بلوك
  const existingBlock = await Block.findOne({
    $or: [
      { blocker: followerId, blocked: followingId },
      { blocker: followingId, blocked: followerId },
    ],
  });

  if (existingBlock) {
    throw new Error('Cannot follow this user due to blocking restrictions');
  }

  // نتأكد إنه مش عامله فولو أصلاً
  const existingFollow = await Follow.findOne({
    follower: followerId,
    following: followingId,
  });

  if (existingFollow) {
    throw new Error('You are already following this user');
  }

  // إنشاء الفولو وتزويد العدادات
  await Follow.create({ follower: followerId, following: followingId });
  await User.findByIdAndUpdate(followerId, { $inc: { followingCount: 1 } });
  await User.findByIdAndUpdate(followingId, { $inc: { followerCount: 1 } });

  return { status: 'followed' };
};

exports.unfollowUser = async (followerId, followingId) => {
  // ندور على الفولو عشان نمسحه
  const existingFollow = await Follow.findOne({
    follower: followerId,
    following: followingId,
  });

  if (!existingFollow) {
    throw new Error('You are not following this user');
  }

  // مسح الفولو وتقليل العدادات
  await Follow.findByIdAndDelete(existingFollow._id);
  await User.findByIdAndUpdate(followerId, { $inc: { followingCount: -1 } });
  await User.findByIdAndUpdate(followingId, { $inc: { followerCount: -1 } });

  return { status: 'unfollowed' };
};

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

  // إنشاء البلوك
  await Block.create({ blocker: blockerId, blocked: blockedId });

  // تدمير أي علاقة فولو بين الطرفين فوراً
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

  // فك البلوك
  await Block.findByIdAndDelete(existingBlock._id);

  return { status: 'unblocked' };
};
