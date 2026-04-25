const playbackService = require('../services/playbackService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

/**
 * @desc    Update user's playback progress for a track
 * @route   POST /api/history/progress
 * @access  Protected
 */
exports.updateProgress = catchAsync(async (req, res, next) => {
  const { trackId, progress, playlistId } = req.body;

  if (!trackId || progress === undefined) {
    return next(new AppError('Please provide both trackId and progress.', 400));
  }

  const historyRecord = await playbackService.recordPlaybackProgress(
    req.user._id,
    trackId,
    progress,
    playlistId || null
  );

  res.status(200).json({
    status: 'success',
    data: { history: historyRecord },
  });
});

/**
 * @desc    Get recently played tracks only (History tab — track list)
 * @route   GET /api/history/recently-played
 * @access  Protected
 */
exports.getRecentlyPlayed = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;

  const recentlyPlayed = await playbackService.getRecentlyPlayed(
    req.user._id,
    page,
    limit
  );

  res.status(200).json({
    success: true,
    results: recentlyPlayed.length,
    page,
    data: { recentlyPlayed },
  });
});

/**
 * @desc    Get recently played playlists only
 * @route   GET /api/history/recently-played-playlists
 * @access  Protected
 */
exports.getRecentlyPlayedPlaylists = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;

  const recentlyPlayed = await playbackService.getRecentlyPlayedPlaylists(
    req.user._id,
    page,
    limit
  );

  res.status(200).json({
    status: 'success',
    results: recentlyPlayed.length,
    data: { recentlyPlayed },
  });
});

/**
 * @desc    Get mixed recently played (tracks + playlists) for home page widget
 * @route   GET /api/history/recently-played-mixed
 * @access  Protected
 */
exports.getRecentlyPlayedMixed = catchAsync(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 10;

  const mixed = await playbackService.getRecentlyPlayedMixed(
    req.user._id,
    limit
  );

  res.status(200).json({
    status: 'success',
    results: mixed.length,
    data: { recentlyPlayed: mixed },
  });
});
/**
 * @desc    Clear all listening history
 * @route   DELETE /api/history
 * @access  Protected
 */
exports.clearHistory = catchAsync(async (req, res, next) => {
  await playbackService.clearListeningHistory(req.user._id);

  res.status(200).json({
    status: 'success',
    message: 'Listening history cleared successfully.',
  });
});
