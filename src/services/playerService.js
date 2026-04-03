const Track = require('../models/trackModel');
const PlayerState = require('../models/playerStateModel');
const playbackService = require('./playbackService');
const AppError = require('../utils/appError');

exports.getStreamingData = async (trackId, user) => {
  const track = await Track.findById(trackId);

  if (!track) {
    throw new AppError('Track not found', 404);
  }

  if (track.processingState !== 'Finished' || !track.hlsUrl) {
    throw new AppError('Track audio is still processing or unavailable', 400);
  }

  // This will automatically throw a 403 error if they are blocked.
  playbackService.checkAccessibility(user, track, 'stream');

  return {
    streamUrl: track.hlsUrl,
    duration: track.duration,
    format: track.format,
  };
};

exports.getPlayerState = async (userId) => {
  const state = await PlayerState.findOne({ user: userId })
    .select('-__v')
    .populate({
      path: 'currentTrack',
      select: 'title permalink artworkUrl duration artist',
      populate: { path: 'artist', select: 'displayName permalink' }, // <-- Gets the Artist info
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

  if (currentTrack) {
    const track = await Track.findById(currentTrack);
    if (!track) throw new AppError('Track not found', 404);

    if (currentTime < 0) {
      validCurrentTime = 0;
    } else if (currentTime > track.duration) {
      validCurrentTime = track.duration;
    }
  }

  const state = await PlayerState.findOneAndUpdate(
    { user: userId },
    {
      currentTrack,
      currentTime: validCurrentTime,
      isPlaying,
      queueContext,
      contextId,
    },
    { new: true, upsert: true, runValidators: true }
  )
    .select('-__v')
    .populate({
      path: 'currentTrack',
      select: 'title permalink artworkUrl duration artist',
      populate: { path: 'artist', select: 'displayName permalink' }, // <-- Gets the Artist info
    });

  return state;
};
