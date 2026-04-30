const stationService = require('../services/stationService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

/**
 * POST /api/stations/:stationId/like
 * Body: { stationType, stationTitle?, stationDescription?, artistId?, genre? }
 */
exports.likeStation = catchAsync(async (req, res, next) => {
  const userId = req.user._id || req.user.id;
  if (!userId) return next(new AppError('User ID is required', 400));

  const { stationId } = req.params;
  const { stationType, stationTitle, stationDescription, artistId, genre } =
    req.body;

  const result = await stationService.likeStation(userId, {
    stationId,
    stationType,
    stationTitle,
    stationDescription,
    artistId,
    genre,
  });

  res.status(201).json({
    success: true,
    message: 'Station liked successfully.',
    data: result,
  });
});

/**
 * DELETE /api/stations/:stationId/like
 */
exports.unlikeStation = catchAsync(async (req, res, next) => {
  const userId = req.user._id || req.user.id;
  if (!userId) return next(new AppError('User ID is required', 400));

  const { stationId } = req.params;
  const result = await stationService.unlikeStation(userId, stationId);

  res.status(200).json({
    success: true,
    message: 'Station unliked successfully.',
    data: result,
  });
});

/**
 * GET /api/stations/liked
 * Query: page, limit, hydrate (default true)
 */
exports.getLikedStations = catchAsync(async (req, res, next) => {
  const userId = req.user._id || req.user.id;
  if (!userId) return next(new AppError('User ID is required', 400));

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  // Pass hydrate=false for a lightweight list (no track fetching)
  const hydrate = req.query.hydrate !== 'false';

  const result = await stationService.getLikedStations(userId, page, limit, hydrate);

  res.status(200).json({
    success: true,
    results: result.stations.length,
    data: result,
  });
});

/**
 * GET /api/stations/:stationId/like
 * Returns { liked: true/false } for the current user.
 */
exports.checkStationLiked = catchAsync(async (req, res, next) => {
  const userId = req.user._id || req.user.id;
  if (!userId) return next(new AppError('User ID is required', 400));

  const { stationId } = req.params;
  const result = await stationService.checkStationLiked(userId, stationId);

  res.status(200).json({
    success: true,
    data: result,
  });
});
