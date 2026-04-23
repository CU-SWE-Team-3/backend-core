const ListenHistory = require('../models/listenHistoryModel');
const AppError = require('../utils/appError');
const Track = require('../models/trackModel');

/**
 * Records playback progress for a track.
 * Optionally accepts a playlistId if the track is being played from a playlist.
 */
exports.recordPlaybackProgress = async (
  userId,
  trackId,
  progress,
  playlistId = null
) => {
  const track = await Track.findById(trackId);
  if (!track) return null;

  const historyRecord = await ListenHistory.findOneAndUpdate(
    { user: userId, track: trackId, type: 'track' },
    { progress, playedAt: Date.now(), playlist: playlistId || null },
    { new: true, upsert: true }
  ).select('-__v');

  const isStartingOver = progress < track.duration * 0.1;
  const isCompletedPlay = progress >= track.duration * 0.9;

  const shouldCountPlay =
    isCompletedPlay && (!historyRecord || historyRecord.isPlayCounted !== true);

  const updateData = {
    $set: {
      progress,
      playedAt: Date.now(),
      playlist: playlistId || null,
    },
  };

  if (isStartingOver) {
    updateData.$set.isPlayCounted = false;
  } else if (isCompletedPlay) {
    updateData.$set.isPlayCounted = true;
  }

  const updatedHistory = await ListenHistory.findOneAndUpdate(
    { user: userId, track: trackId, type: 'track' },
    updateData,
    { new: true, upsert: true }
  );

  if (shouldCountPlay) {
    await Track.findByIdAndUpdate(trackId, {
      $inc: { playCount: 1, viralScore: 1 },
    });
  }

  // If played from a playlist, also upsert a playlist-type history record
  if (playlistId) {
    await ListenHistory.findOneAndUpdate(
      { user: userId, playlist: playlistId, type: 'playlist' },
      { playedAt: Date.now() },
      { upsert: true }
    );
  }

  return updatedHistory;
};

/**
 * Recently played TRACKS only (the History tab — track list).
 * Includes which playlist each track was played from.
 */
exports.getRecentlyPlayed = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const history = await ListenHistory.find({ user: userId, type: 'track' })
    .select('-__v')
    .sort({ playedAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'track',
      select:
        'title permalink artworkUrl artist duration playCount likeCount isPublic',
      populate: {
        path: 'artist',
        select: 'displayName permalink avatarUrl isPremium',
      },
    })
    .populate({
      path: 'playlist',
      select: 'title permalink artworkUrl creator',
      populate: {
        path: 'creator',
        select: 'displayName permalink',
      },
    });

  return history;
};

/**
 * Recently played PLAYLISTS only.
 */
exports.getRecentlyPlayedPlaylists = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const history = await ListenHistory.find({ user: userId, type: 'playlist' })
    .sort({ playedAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'playlist',
      select: 'title permalink artworkUrl trackCount creator releaseType',
      populate: {
        path: 'creator',
        select: 'displayName permalink avatarUrl',
      },
    });

  return history.filter((h) => h.playlist !== null);
};

/**
 * Mixed recently played — both tracks and playlists merged and sorted by playedAt.
 * This is what the home page "Recently Played" widget shows.
 */
exports.getRecentlyPlayedMixed = async (userId, limit = 10) => {
  const history = await ListenHistory.find({ user: userId })
    .sort({ playedAt: -1 })
    .limit(limit * 2)
    .populate({
      path: 'track',
      select: 'title permalink artworkUrl artist duration',
      populate: { path: 'artist', select: 'displayName permalink avatarUrl' },
    })
    .populate({
      path: 'playlist',
      select: 'title permalink artworkUrl trackCount creator releaseType',
      populate: { path: 'creator', select: 'displayName permalink avatarUrl' },
    });

  // Map each record to a unified shape and filter out nulls
  const merged = history
    .map((h) => {
      if (h.type === 'track' && h.track) {
        return { type: 'track', playedAt: h.playedAt, item: h.track };
      }
      if (h.type === 'playlist' && h.playlist) {
        return { type: 'playlist', playedAt: h.playedAt, item: h.playlist };
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, limit);

  return merged;
};

/**
 * Accessibility check for streaming and downloading.
 */
exports.checkAccessibility = (user, track, action = 'stream') => {
  if (!track.isPublic && track.artist.toString() !== user._id.toString()) {
    throw new AppError('This track is private and cannot be accessed.', 403);
  }

  if (action === 'stream') {
    return true;
  }

  if (action === 'download') {
    if (user.subscriptionPlan !== 'Go+') {
      throw new AppError(
        'Requires a Go+ Subscription for offline listening.',
        403
      );
    }
    return true;
  }

  throw new AppError('Invalid action requested.', 400);
};

/**
 * Clear all listening history for a user (both tracks and playlists).
 */
exports.clearListeningHistory = async (userId) => {
  await ListenHistory.deleteMany({ user: userId });
  return true;
};
