const Interaction = require('../models/interactionModel');
const Track = require('../models/trackModel');
const AppError = require('../utils/appError');
const notificationService = require('./notificationService');
const Playlist = require('../models/playlistModel');

const Block = require('../models/blockModel');

/**
 * Adds a repost for a user on a specific track
 */
exports.addRepost = async (userId, trackId) => {
  const track = await Track.findById(trackId);
  if (!track) {
    throw new AppError('Track not found', 404);
  }
  // ---> NEW TRUST & SAFETY CHECK (Using Block Model) <---
  // Check if either user has blocked the other
  const blockRecord = await Block.findOne({
    $or: [
      { blocker: track.artist, blocked: userId }, // The Artist blocked the Commenter/Liker
      { blocker: userId, blocked: track.artist }, // The Commenter/Liker blocked the Artist
    ],
  });

  if (blockRecord) {
    throw new AppError(
      'You are blocked from interacting with this user (or you have blocked them).',
      403
    );
  }
  // -------------------------------------------------------

  const existingInteraction = await Interaction.findOne({
    actorId: userId,
    targetId: trackId,
    actionType: 'REPOST',
  });

  if (existingInteraction) {
    throw new AppError('You have already reposted this track', 400);
  }

  // Create interaction and increment counter
  await Interaction.create({
    actorId: userId,
    targetId: trackId,
    actionType: 'REPOST',
  });
  await Track.findByIdAndUpdate(trackId, { $inc: { repostCount: 1 } });

  // REPLACE YOUR TODO WITH THIS:
  notificationService.notifyRepost(track.artist, userId, trackId);

  return { reposted: true };
};

/**
 * Removes a repost for a user on a specific track
 */
exports.removeRepost = async (userId, trackId) => {
  const track = await Track.findById(trackId);
  if (!track) {
    throw new AppError('Track not found', 404);
  }

  const existingInteraction = await Interaction.findOne({
    actorId: userId,
    targetId: trackId,
    actionType: 'REPOST',
  });

  if (!existingInteraction) {
    throw new AppError('You have not reposted this track', 400);
  }

  // Delete interaction and decrement counter
  await Interaction.findByIdAndDelete(existingInteraction._id);
  await Track.findByIdAndUpdate(trackId, { $inc: { repostCount: -1 } });
  notificationService.retractNotification(
    track.artist,
    userId,
    'REPOST',
    trackId
  );
  return { reposted: false };
};

/**
 * Fetches users who engaged with a track (Likes or Reposts)
 */
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
      match: { processingState: 'Finished', releaseDate: { $lte: new Date() } },
      // NEW: Added this select to prevent sending backend-only track data to the frontend
      select:
        'title artworkurl duration audioUrl waveform playCount likeCount repostCount createdAt',
      populate: {
        path: 'artist',
        // NEW: Also added role and isPremium here for the artist on the track card!
        select: 'displayName permalink avatarUrl role isPremium',
      },
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
      track: interaction.targetId,
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
      match: { processingState: 'Finished', releaseDate: { $lte: new Date() } },
      // NEW: Added this select to prevent sending backend-only track data to the frontend
      select:
        'title artworkurl duration audioUrl waveform playCount likeCount repostCount createdAt',
      populate: {
        path: 'artist',
        // NEW: Also added role and isPremium here for the artist on the track card!
        select: 'displayName permalink avatarUrl role isPremium',
      },
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
      track: interaction.targetId,
    }));

  return {
    total,
    page: parseInt(page, 10),
    totalPages: Math.ceil(total / limit),
    likedTracks,
  };
};

/**
 * Adds a like for a user on a specific track (BE-1: Yehia)
 */
exports.addLike = async (userId, trackId) => {
  const track = await Track.findById(trackId);
  if (!track) {
    throw new AppError('Track not found', 404);
  }
  // ---> NEW TRUST & SAFETY CHECK (Using Block Model) <---
  const blockRecord = await Block.findOne({
    $or: [
      { blocker: track.artist, blocked: userId },
      { blocker: userId, blocked: track.artist },
    ],
  });

  if (blockRecord) {
    throw new AppError('You are blocked from interacting with this user.', 403);
  }
  // -------------------------------------------------------
  const existingInteraction = await Interaction.findOne({
    actorId: userId,
    targetId: trackId,
    actionType: 'LIKE',
  });

  if (existingInteraction) {
    throw new AppError('You have already liked this track', 400);
  }

  // Create interaction and increment like counter
  await Interaction.create({
    actorId: userId,
    targetId: trackId,
    actionType: 'LIKE',
  });
  await Track.findByIdAndUpdate(trackId, { $inc: { likeCount: 1 } });
  notificationService.notifyLike(track.artist, userId, trackId);
  return { liked: true };
};

/**
 * Removes a like for a user on a specific track (BE-1: Yehia)
 */
exports.removeLike = async (userId, trackId) => {
  const track = await Track.findById(trackId);
  if (!track) {
    throw new AppError('Track not found', 404);
  }

  const existingInteraction = await Interaction.findOne({
    actorId: userId,
    targetId: trackId,
    actionType: 'LIKE',
  });

  if (!existingInteraction) {
    throw new AppError('You have not liked this track', 400);
  }

  // Delete interaction and decrement counter
  await Interaction.findByIdAndDelete(existingInteraction._id);
  await Track.findByIdAndUpdate(trackId, { $inc: { likeCount: -1 } });

  notificationService.retractNotification(
    track.artist,
    userId,
    'LIKE',
    trackId
  );
  return { liked: false };
};
exports.addPlaylistLike = async (userId, playlistId) => {
  const playlist = await Playlist.findById(playlistId);
  if (!playlist) throw new AppError('Playlist not found', 404);
  // ---> NEW TRUST & SAFETY CHECK (Using Block Model) <---
  // Check if either user has blocked the other
  const blockRecord = await Block.findOne({
    $or: [
      { blocker: playlist.creator, blocked: userId },
      { blocker: userId, blocked: playlist.creator },
    ],
  });

  if (blockRecord) {
    throw new AppError('You are blocked from interacting with this user.', 403);
  }
  // -------------------------------------------------------

  // Your existing interaction creation logic...
  await Interaction.create({
    actorId: userId,
    targetId: playlistId,
    actionType: 'LIKE',
  });
  await Playlist.findByIdAndUpdate(playlistId, { $inc: { likeCount: 1 } });

  // MODULE 10 TRIGGER

  if (playlist.creator.toString() !== userId.toString()) {
    notificationService.notifyLike(playlist.creator, userId, playlistId);
  }

  return { liked: true };
};

/**
 * Removes a like for a playlist
 */
exports.removePlaylistLike = async (userId, playlistId) => {
  const playlist = await Playlist.findById(playlistId);
  if (!playlist) throw new AppError('Playlist not found', 404);

  await Interaction.findOneAndDelete({
    actorId: userId,
    targetId: playlistId,
    actionType: 'LIKE',
  });
  await Playlist.findByIdAndUpdate(playlistId, { $inc: { likeCount: -1 } });

  // MODULE 10 UNDO TRIGGER

  notificationService.retractNotification(
    playlist.creator,
    userId,
    'LIKE',
    playlistId
  );

  return { liked: false };
};
