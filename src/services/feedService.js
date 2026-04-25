const mongoose = require('mongoose');
const FeedItem = require('../models/feedItemModel');
const Block = require('../models/blockModel');
const Track = require('../models/trackModel');

exports.getUserFeed = async (userId, cursor = null, limit = 40) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const query = { ownerId: userObjectId };

  if (cursor) query.activityDate = { $lt: new Date(cursor) };

  let feedItems = await FeedItem.find(query)
    .sort({ activityDate: -1 })
    .limit(parseInt(limit, 10))
    .populate({ path: 'actorId', select: 'displayName permalink avatarUrl' })
    // ==========================================
    // UPDATE: Populate targetId instead of trackId
    // ==========================================
    .populate({
      path: 'targetId',
      select:
        'title permalink artworkUrl duration artist creator playCount likeCount repostCount',
      populate: [
        {
          path: 'artist',
          select: 'displayName permalink avatarUrl',
          strictPopulate: false,
        },
        {
          path: 'creator',
          select: 'displayName permalink avatarUrl',
          strictPopulate: false,
        },
      ],
    })
    .lean();

  let nextCursor = null;
  if (feedItems.length > 0) {
    nextCursor = feedItems[feedItems.length - 1].activityDate.toISOString();
  }

  const blockDocs = await Block.find({
    $or: [{ blocker: userObjectId }, { blocked: userObjectId }],
  }).lean();
  const blockedIds = blockDocs.map((doc) =>
    doc.blocker.toString() === userId.toString()
      ? doc.blocked.toString()
      : doc.blocker.toString()
  );

  // ==========================================
  // UPDATE: Filter using targetId (FIXED)
  // ==========================================
  feedItems = feedItems.filter((item) => {
    // 1. If the item or actor was deleted, drop it
    if (!item.targetId || !item.actorId) return false;

    // 2. Safely check visibility (Drop ONLY if explicitly marked private)
    if (item.targetId.isPublic === false) return false;

    const actorStr = item.actorId._id.toString();

    // 3. FIX: Tracks use 'artist', Playlists use 'creator'
    let creatorId = null;
    if (item.targetId.artist) {
      creatorId = item.targetId.artist._id;
    } else if (item.targetId.creator) {
      creatorId = item.targetId.creator._id;
    }

    const creatorStr = creatorId ? creatorId.toString() : null;

    // 4. Block system checks
    if (blockedIds.includes(actorStr)) return false;
    if (creatorStr && blockedIds.includes(creatorStr)) return false;

    return true;
  });

  // ==========================================
  // UPDATE: Grouping logic using targetId
  // ==========================================
  const groupedFeed = [];
  feedItems.forEach((item) => {
    const existingGroup = groupedFeed.find(
      (g) =>
        g.target._id.toString() === item.targetId._id.toString() &&
        g.targetModel === item.targetModel && // Ensure we group Tracks with Tracks, etc.
        g.activityType === item.activityType
    );

    if (existingGroup) {
      const actorAlreadyInGroup = existingGroup.actors.some(
        (a) => a._id.toString() === item.actorId._id.toString()
      );
      if (!actorAlreadyInGroup) existingGroup.actors.push(item.actorId);
    } else {
      groupedFeed.push({
        activityType: item.activityType,
        activityDate: item.activityDate,
        actors: [item.actorId],
        target: item.targetId, // Changed from 'track' to 'target'
        targetModel: item.targetModel, // Tell the frontend what type of entity this is!
      });
    }
  });

  // ==========================================
  // AD INJECTION (Remains exactly the same)
  // ==========================================
  const promotedTrack = await Track.findOne({ isPromoted: true })
    .select(
      'title permalink artworkUrl duration artist isPublic moderationStatus'
    )
    .populate({ path: 'artist', select: 'displayName permalink avatarUrl' })
    .lean();

  if (promotedTrack && groupedFeed.length >= 5) {
    groupedFeed.splice(4, 0, {
      activityType: 'PROMOTED',
      activityDate: new Date(),
      actors: [
        {
          _id: null,
          displayName: 'BioBeats',
          permalink: 'biobeats',
          avatarUrl: null,
        },
      ],
      target: promotedTrack,
      targetModel: 'Track',
      isAd: true,
    });
  }

  return { feedActivities: groupedFeed, nextCursor };
};
