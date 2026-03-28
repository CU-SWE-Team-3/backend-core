const playerService = require('../services/playerService');
const catchAsync = require('../utils/catchAsync');

exports.getStreamingUrl = catchAsync(async (req, res, next) => {
  // Pass the whole req.user object to the service for checks
  const streamData = await playerService.getStreamingData(
    req.params.id,
    req.user
  );

  res.status(200).json({
    status: 'success',
    data: streamData,
  });
});

exports.getPlayerState = catchAsync(async (req, res, next) => {
  const state = await playerService.getPlayerState(req.user.id);

  res.status(200).json({
    status: 'success',
    data: state,
  });
});

exports.updatePlayerState = catchAsync(async (req, res, next) => {
  const state = await playerService.updatePlayerState(req.user.id, req.body);

  res.status(200).json({
    status: 'success',
    data: state,
  });
});
