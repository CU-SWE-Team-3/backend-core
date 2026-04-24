const trendingService = require('../services/trendingService');
const catchAsync = require('../utils/catchAsync');

exports.getTrendingCharts = catchAsync(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 20;
  const { genre } = req.query;

  const trendingTracks = await trendingService.getTrendingTracks(limit, genre);

  res.status(200).json({
    success: true,
    results: trendingTracks.length,
    data: {
      trending: trendingTracks,
    },
  });
});
