const playbackService = require('../services/playbackService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

/**
 * @desc    Update user's playback progress for a track
 * @route   POST /api/history/progress
 * @access  Protected
 */
exports.updateProgress = catchAsync(async (req, res, next) => {
  const { trackId, progress } = req.body;

  if (!trackId || progress === undefined) {
    return next(new AppError('Please provide both trackId and progress.', 400));
  }

  // Uses the service we just created to update the database
  const historyRecord = await playbackService.recordPlaybackProgress(
    req.user._id,
    trackId,
    progress
  );

  res.status(200).json({
    status: 'success',
    data: {
      history: historyRecord,
    },
  });
});

/**
 * @desc    Get user's recently played tracks
 * @route   GET /api/history/recently-played
 * @access  Protected
 */
exports.getRecentlyPlayed = catchAsync(async (req, res, next) => {
  // Setup basic pagination so we don't send massive arrays to the frontend
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;

  const recentlyPlayed = await playbackService.getRecentlyPlayed(
    req.user._id,
    page,
    limit
  );

  res.status(200).json({
    status: 'success',
    results: recentlyPlayed.length,
    data: {
      recentlyPlayed,
    },
  });
});
