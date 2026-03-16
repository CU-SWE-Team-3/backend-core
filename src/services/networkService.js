const Follow = require('../models/followModel');
const User = require('../models/userModel');

const followUser = async (followerId, followingId) => {
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

const unfollowUser = async (followerId, followingId) => {
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

const getUserFollowers = async (userId) => {
  const follows = await Follow.find({ following: userId })
    .populate('follower', '_id displayName avatarUrl permalink role'); 
  return follows.map(rel => rel.follower);
};

const getUserFollowing = async (userId) => {
  const follows = await Follow.find({ follower: userId })
    .populate('following', '_id displayName avatarUrl permalink role');
  return followa.map(rel => rel.following);
};


// auomatically generate feed for user based on who they follow
const getUserFeed = async (userId) => {
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

// Update your exports block at the bottom
module.exports = {
  followUser,
  unfollowUser,
  getUserFollowers,
  getUserFollowing,
  getUserFeed 
};

