const discoveryService = require('../services/discoveryService');
const catchAsync = require('../utils/catchAsync');

exports.getTrendingStation = catchAsync(async (req, res, next) => {
  const trendingTracks = await discoveryService.getTrendingTracks();

  res.status(200).json({
    status: 'success',
    results: trendingTracks.length, // <--- ADDED THIS LINE
    data: { tracks: trendingTracks },
  });
});

exports.getStationBasedOnLikes = catchAsync(async (req, res, next) => {
  const recommendedTracks = await discoveryService.getRecommendedBasedOnLikes(
    req.user._id
  );

  res.status(200).json({
    status: 'success',
    results: recommendedTracks.length, // <--- ADDED THIS LINE
    data: { tracks: recommendedTracks },
  });
});

exports.getStationByGenre = catchAsync(async (req, res, next) => {
  const { genre } = req.params;
  const tracks = await discoveryService.getStationByGenre(genre);

  res.status(200).json({
    status: 'success',
    results: tracks.length, // <--- ADDED THIS LINE
    data: { tracks },
  });
});

exports.getStationByArtist = catchAsync(async (req, res, next) => {
  const { artistId } = req.params;
  const tracks = await discoveryService.getStationByArtist(artistId);

  res.status(200).json({
    status: 'success',
    results: tracks.length, // <--- ADDED THIS LINE
    data: { tracks },
  });
});
// ... (keep your existing getTrendingStation, getStationBasedOnLikes, etc.)

// 🌟 BONUS: Get Related Tracks
exports.getRelatedTracks = catchAsync(async (req, res, next) => {
  const { trackId } = req.params;
  const tracks = await discoveryService.getRelatedTracks(trackId);

  res.status(200).json({
    status: 'success',
    results: tracks.length,
    data: { tracks },
  });
});

// 🌟 BONUS: Get Collaborative Filtering Tracks
exports.getUsersWhoLikedAlsoLiked = catchAsync(async (req, res, next) => {
  const { trackId } = req.params;
  const tracks = await discoveryService.getUsersWhoLikedAlsoLiked(trackId);

  res.status(200).json({
    status: 'success',
    results: tracks.length,
    data: { tracks },
  });
});
