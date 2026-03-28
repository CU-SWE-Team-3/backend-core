const Track = require('../models/trackModel');
const PlayerState = require('../models/playerStateModel');
const AppError = require('../utils/appError');

exports.getStreamingData = async (trackId, userId) => {
  const track = await Track.findById(trackId);

  if (!track) {
    throw new AppError('Track not found', 404);
  }

  if (track.processingState !== 'Finished' || !track.hlsUrl) {
    throw new AppError('Track audio is still processing or unavailable', 400);
  }

  if (!track.isPublic && track.artist.toString() !== userId) {
    throw new AppError('You do not have permission to stream this track', 403);
  }

  return {
    streamUrl: track.hlsUrl,
    duration: track.duration,
    format: track.format,
  };
};

exports.getPlayerState = async (userId) => {
  const state = await PlayerState.findOne({ user: userId }).populate({
    path: 'currentTrack',
    select: 'title permalink artworkUrl duration artist',
    populate: { path: 'artist', select: 'displayName permalink' },
  });

  if (!state) {
    return {
      currentTrack: null,
      currentTime: 0,
      isPlaying: false,
      queueContext: 'none',
      contextId: null,
    };
  }

  return state;
};

exports.updatePlayerState = async (userId, stateData) => {
  const { currentTrack, currentTime, isPlaying, queueContext, contextId } =
    stateData;

  let validCurrentTime = currentTime;

  // 1. If a track is being played, let's strictly validate the time against the track's real duration
  if (currentTrack) {
    const track = await Track.findById(currentTrack);

    if (!track) {
      throw new AppError('Track not found', 404);
    }

    // 2. Realistic Constraints: Protect the database from impossible times
    if (currentTime < 0) {
      validCurrentTime = 0; // Prevent negative time
    } else if (currentTime > track.duration) {
      // If the frontend sends a time longer than the track, cap it exactly at the end of the track.
      // We cap it instead of throwing an error because frontend timers can sometimes drift by a few milliseconds.
      validCurrentTime = track.duration;
    }
  }

  // 3. Perform the Atomic Update with the validated time
  const state = await PlayerState.findOneAndUpdate(
    { user: userId },
    {
      currentTrack,
      currentTime: validCurrentTime, // Use the safely constrained time here!
      isPlaying,
      queueContext,
      contextId,
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    }
  ).populate({
    path: 'currentTrack',
    select: 'title permalink artworkUrl duration',
  });

  return state;
};
