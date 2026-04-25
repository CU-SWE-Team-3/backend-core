const Interaction = require('../models/interactionModel');
const Track = require('../models/trackModel');
const AppError = require('../utils/appError');
const { publishToQueue } = require('../utils/queueProducer');
const FeedItem = require('../models/feedItemModel');
const Playlist = require('../models/playlistModel');
const notificationService = require('./notificationService'); // 👈 ADDED: Notification Service

/**
 * Adds a repost for a user on a specific track or playlist
 */
exports.addRepost = async (userId, targetId, targetModel = 'Track') => {
  // 1. DYNAMIC MODEL SELECTION
  const Model = targetModel === 'Playlist' ? Playlist : Track;

  // Verify the entity exists
  const entity = await Model.findById(targetId);
  if (!entity) {
    throw new AppError(`${targetModel} not found`, 404);
  }

  // Check for idempotency (prevent double reposts)
  const existingInteraction = await Interaction.findOne({
    actorId: userId,
    targetId: targetId,
    actionType: 'REPOST',
  });

  if (existingInteraction) {
    throw new AppError(
      `You have already reposted this ${targetModel.toLowerCase()}`,
      400
    );
  }

  // Create interaction
  await Interaction.create({
    actorId: userId,
    targetId: targetId,
    targetModel: targetModel, // 👈 CRITICAL: Save the model type in the DB!
    actionType: 'REPOST',
  });

  // Increment the repost counter dynamically
  const updatedEntity = await Model.findByIdAndUpdate(
    targetId,
    { $inc: { repostCount: 1, viralScore: 10 } },
    { new: true }
  );

  // Publish Polymorphic Data to RabbitMQ
  await publishToQueue('feed_fanout_queue_v3', {
    actorId: userId,
    activityType: 'REPOST',
    targetId: targetId,
    targetModel: targetModel, // Tells the worker what kind of entity this is
  });

  // 👈 ADDED: Trigger Notification (dynamically gets artist or creator)
  const ownerId = entity.artist || entity.creator;
  notificationService.notifyRepost(ownerId, userId, targetId, targetModel);

  return {
    reposted: true,
    newRepostCount: updatedEntity.repostCount,
  };
};

/**
 * Removes a repost for a user on a specific track or playlist
 */
exports.removeRepost = async (userId, targetId, targetModel = 'Track') => {
  // 1. DYNAMIC MODEL SELECTION
  const Model = targetModel === 'Playlist' ? Playlist : Track;

  const entity = await Model.findById(targetId);
  if (!entity) {
    throw new AppError(`${targetModel} not found`, 404);
  }

  const existingInteraction = await Interaction.findOne({
    actorId: userId,
    targetId: targetId,
    actionType: 'REPOST',
  });

  if (!existingInteraction) {
    throw new AppError(
      `You have not reposted this ${targetModel.toLowerCase()}`,
      400
    );
  }

  // Delete interaction and decrement counter dynamically
  await Interaction.findByIdAndDelete(existingInteraction._id);
  await Model.findByIdAndUpdate(targetId, [
    {
      $set: {
        repostCount: { $max: [0, { $subtract: ['$repostCount', 1] }] },
        viralScore: { $max: [0, { $subtract: ['$viralScore', 10] }] }, // Subtract the 10 points
      },
    },
  ]);
  // Cleanup the feed
  await FeedItem.deleteMany({
    actorId: userId,
    activityType: 'REPOST',
    targetId: targetId,
    targetModel: targetModel,
  });

  // 👈 ADDED: Retract Notification
  const ownerId = entity.artist || entity.creator;
  notificationService.retractNotification(ownerId, userId, 'REPOST', targetId);

  return { reposted: false };
};
/**
 * Fetches users who engaged with a track (Likes or Reposts)
 */
exports.getTrackEngagers = async (
  trackId,
  actionType,
  page = 1,
  limit = 20
) => {
  const skip = (page - 1) * limit;

  const interactions = await Interaction.find({
    targetId: trackId,
    actionType: actionType,
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'actorId',
      // NEW: Added role, isPremium, and isEmailVerified so the frontend can display badges!
      select:
        'displayName permalink avatarUrl followerCount role isPremium isEmailVerified',
    });

  const total = await Interaction.countDocuments({
    targetId: trackId,
    actionType,
  });

  // Map the array to return just the user objects, not the interaction metadata
  const users = interactions.map((interaction) => interaction.actorId);

  return {
    total,
    page: parseInt(page, 10),
    totalPages: Math.ceil(total / limit),
    users,
  };
};

/**
 * Fetches the tracks that a user has reposted (for their profile activity feed)
 */
exports.getUserReposts = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const repostInteractions = await Interaction.find({
    actorId: userId,
    actionType: 'REPOST',
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'targetId',
      // 1. MATCH: Allow Finished Tracks OR Playlists (which don't have processingState)
      match: {
        $and: [
          {
            $or: [
              { processingState: 'Finished' },
              { processingState: { $exists: false } }, // Playlists pass this!
            ],
          },
          {
            $or: [
              { releaseDate: { $lte: new Date() } },
              { releaseDate: { $exists: false } }, // Just in case it's unset
            ],
          },
        ],
      },
      // 2. SELECT: Ask for fields from BOTH models (Mongoose will just ignore what's missing)
      select:
        'title artworkUrl duration audioUrl waveform playCount likeCount repostCount createdAt trackCount artist creator',
      // 3. NESTED POPULATE: Tell Mongoose to populate both owner fields!
      populate: [
        {
          path: 'artist', // This will fire for Tracks
          select: 'displayName permalink avatarUrl role isPremium',
          strictPopulate: false,
        },
        {
          path: 'creator', // This will fire for Playlists
          select: 'displayName permalink avatarUrl role isPremium',
          strictPopulate: false,
        },
      ],
    });

  const total = await Interaction.countDocuments({
    actorId: userId,
    actionType: 'REPOST',
  });

  // Filter out nulls (if a track was deleted) and format for frontend
  const repostedTracks = repostInteractions
    .filter((interaction) => interaction.targetId != null)
    .map((interaction) => ({
      repostDate: interaction.createdAt,
      target: interaction.targetId,
      targetModel: interaction.targetModel,
    }));

  return {
    total,
    page: parseInt(page, 10),
    totalPages: Math.ceil(total / limit),
    repostedTracks,
  };
};

exports.getUserLikes = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const likeInteractions = await Interaction.find({
    actorId: userId,
    actionType: 'LIKE',
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'targetId',
      // 1. MATCH: Allow Finished Tracks OR Playlists (which don't have processingState)
      match: {
        $and: [
          {
            $or: [
              { processingState: 'Finished' },
              { processingState: { $exists: false } }, // Playlists pass this!
            ],
          },
          {
            $or: [
              { releaseDate: { $lte: new Date() } },
              { releaseDate: { $exists: false } }, // Just in case it's unset
            ],
          },
        ],
      },
      // 2. SELECT: Ask for fields from BOTH models (Mongoose will just ignore what's missing)
      select:
        'title artworkUrl duration audioUrl waveform playCount likeCount repostCount createdAt trackCount artist creator',
      // 3. NESTED POPULATE: Tell Mongoose to populate both owner fields!
      populate: [
        {
          path: 'artist', // This will fire for Tracks
          select: 'displayName permalink avatarUrl role isPremium',
          strictPopulate: false,
        },
        {
          path: 'creator', // This will fire for Playlists
          select: 'displayName permalink avatarUrl role isPremium',
          strictPopulate: false,
        },
      ],
    });

  const total = await Interaction.countDocuments({
    actorId: userId,
    actionType: 'LIKE',
  });

  // Filter out nulls (if a track was deleted) and format for frontend
  const likedTracks = likeInteractions
    .filter((interaction) => interaction.targetId != null)
    .map((interaction) => ({
      likeDate: interaction.createdAt,
      target: interaction.targetId,
      targetModel: interaction.targetModel, // Pass this so the frontend knows what UI card to draw!
    }));

  return {
    total,
    page: parseInt(page, 10),
    totalPages: Math.ceil(total / limit),
    likedTracks,
  };
};

/**
 * Adds a like for a user on a specific track or playlist
 */
exports.addLike = async (userId, targetId, targetModel = 'Track') => {
  // 1. DYNAMIC MODEL SELECTION
  const Model = targetModel === 'Playlist' ? Playlist : Track;

  // Verify the entity exists
  const entity = await Model.findById(targetId);
  if (!entity) {
    throw new AppError(`${targetModel} not found`, 404);
  }

  // Check for idempotency (prevent double likes)
  const existingInteraction = await Interaction.findOne({
    actorId: userId,
    targetId: targetId,
    actionType: 'LIKE',
  });

  if (existingInteraction) {
    throw new AppError(
      `You have already liked this ${targetModel.toLowerCase()}`,
      400
    );
  }

  // Create interaction
  await Interaction.create({
    actorId: userId,
    targetId: targetId,
    targetModel: targetModel, // 👈 CRITICAL: Save the model type in the DB!
    actionType: 'LIKE',
  });

  // Increment the like counter dynamically
  const updatedEntity = await Model.findByIdAndUpdate(
    targetId,
    { $inc: { likeCount: 1, viralScore: 3 } },
    { new: true }
  );

  // Publish Polymorphic Data to RabbitMQ
  await publishToQueue('feed_fanout_queue_v3', {
    actorId: userId,
    activityType: 'LIKE',
    targetId: targetId,
    targetModel: targetModel,
  });

  // 👈 ADDED: Trigger Notification (dynamically gets artist or creator)
  const ownerId = entity.artist || entity.creator;
  notificationService.notifyLike(ownerId, userId, targetId, targetModel);

  // Publish Polymorphic Data to RabbitMQ
  await publishToQueue('feed_fanout_queue_v3', {
    actorId: userId,
    activityType: 'LIKE',
    targetId: targetId,
    targetModel: targetModel,
  });

  return {
    liked: true,
    newLikeCount: updatedEntity.likeCount,
  };
};
/**
 * Removes a like for a user on a specific track or playlist
 */
exports.removeLike = async (userId, targetId, targetModel = 'Track') => {
  // 1. DYNAMIC MODEL SELECTION
  const Model = targetModel === 'Playlist' ? Playlist : Track;

  const entity = await Model.findById(targetId);
  if (!entity) {
    throw new AppError(`${targetModel} not found`, 404);
  }

  const existingInteraction = await Interaction.findOne({
    actorId: userId,
    targetId: targetId,
    actionType: 'LIKE',
  });

  if (!existingInteraction) {
    throw new AppError(
      `You have not liked this ${targetModel.toLowerCase()}`,
      400
    );
  }

  // Delete interaction and decrement counter dynamically
  await Interaction.findByIdAndDelete(existingInteraction._id);
  await Model.findByIdAndUpdate(targetId, [
    // 👈 Array brackets for pipeline
    {
      $set: {
        likeCount: { $max: [0, { $subtract: ['$likeCount', 1] }] },
        viralScore: { $max: [0, { $subtract: ['$viralScore', 3] }] }, // Subtract the 3 points
      },
    },
  ]);
  // Cleanup the feed
  await FeedItem.deleteMany({
    actorId: userId,
    activityType: 'LIKE',
    targetId: targetId,
    targetModel: targetModel,
  });

  // 👈 ADDED: Retract Notification
  const ownerId = entity.artist || entity.creator;
  notificationService.retractNotification(ownerId, userId, 'LIKE', targetId);

  return { liked: false };
};
