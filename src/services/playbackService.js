const ListenHistory = require('../models/listenHistoryModel');
const AppError = require('../utils/appError');

const Track = require('../models/trackModel');

/**
 * Updates or creates a listen history record for a user and track.
 * This tracks playback progress and updates the "Recently Played" timestamp.
 */
exports.recordPlaybackProgress = async (userId, trackId, progress) => {
  const track = await Track.findById(trackId);
  if (!track) return null;

  const historyRecord = await ListenHistory.findOneAndUpdate(
    { user: userId, track: trackId },
    { progress: progress, playedAt: Date.now() },
    { new: true, upsert: true }
  ).select('-__v');

  // 1. Define our thresholds
  const isStartingOver = progress < track.duration * 0.1; // Under 10%
  const isCompletedPlay = progress >= track.duration * 0.9; // Over 90%

  // 2. We only count the play if they hit 90% AND it isn't currently locked
  const shouldCountPlay =
    isCompletedPlay && (!historyRecord || historyRecord.isPlayCounted !== true);

  // 3. Setup our database update
  const updateData = {
    $set: {
      progress: progress,
      playedAt: Date.now(),
    },
  };

  // 4. THE MAGIC: Unlock or Lock the play based on where they are in the song
  if (isStartingOver) {
    updateData.$set.isPlayCounted = false; // User restarted the song, unlock it!
  } else if (isCompletedPlay) {
    updateData.$set.isPlayCounted = true; // User finished it, lock it to prevent spam!
  }

  // 5. Update the history record
  const updatedHistory = await ListenHistory.findOneAndUpdate(
    { user: userId, track: trackId },
    updateData,
    { new: true, upsert: true }
  );

  // 6. Increment play count if valid
  if (shouldCountPlay) {
    await Track.findByIdAndUpdate(trackId, { $inc: { playCount: 1 } });
  }

  return updatedHistory;
};
/**
 * Retrieves the "Recently Played" feed for a specific user.
 */
exports.getRecentlyPlayed = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const history = await ListenHistory.find({ user: userId })
    .select('-__v')
    .sort({ playedAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'track',
      select: 'title permalink artworkUrl artist duration playCount isPublic',
      populate: {
        path: 'artist',
        select: 'displayName permalink avatarUrl isPremium',
      },
    });

  return history;
};

/**
 * Evaluates playback and download accessibility based on user tier and track state.
 */
exports.checkAccessibility = (user, track, action = 'stream') => {
  // 1. Check if the track is private and the user is not the owner
  if (!track.isPublic && track.artist.toString() !== user._id.toString()) {
    throw new AppError('This track is private and cannot be accessed.', 403);
  }

  // 2. Handle standard streaming (Free users have standard streaming access)
  if (action === 'stream') {
    return true;
  }

  // 3. Handle Offline Listening / Downloading (Premium Plan Only)
  if (action === 'download') {
    if (!user.isPremium) {
      throw new AppError(
        'Offline listening and downloading are only available on the Premium Plan.',
        403
      );
    }
    return true;
  }

  throw new AppError('Invalid action requested.', 400);
};
