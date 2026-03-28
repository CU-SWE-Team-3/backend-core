const Interaction = require('../models/interactionModel');
const Track = require('../models/trackModel');
const AppError = require('../utils/appError');

/**
 * Adds a repost for a user on a specific track
 */
exports.addRepost = async (userId, trackId) => {
  const track = await Track.findById(trackId);
  if (!track) {
    throw new AppError('Track not found', 404);
  }

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

  // TODO: Trigger notification to track.artist here later in Module 10

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
      match: { processingState: 'Finished' },
      // NEW: Added this select to prevent sending backend-only track data to the frontend
      select:
        'title coverArtUrl duration audioUrl playCount likeCount repostCount createdAt',
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
