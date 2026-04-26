// src/controllers/discoveryController.js  — FULL FILE (replace existing)

const discoveryService = require('../services/discoveryService');
const catchAsync = require('../utils/catchAsync');

// ── Existing ──────────────────────────────────────────────────────────────────

exports.getTrendingCharts = catchAsync(async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const { genre } = req.query;

    const trendingTracks = await discoveryService.getTrendingTracks(
      limit,
      genre
    );

    res.status(200).json({
      success: true,
      results: trendingTracks?.length || 0,
      data: {
        trending: trendingTracks,
      },
    });
  } catch (error) {
    // 🛑 TEMPORARY BLIND DEBUGGING 🛑
    // Instead of a generic 500, we force it to tell us the exact line that broke.
    res.status(500).json({
      success: false,
      crash_message: error.message, // This will say something like "Cache is not defined"
      crash_location: error.stack, // This will tell us the exact line number!
    });
  }
});

exports.getStationBasedOnLikes = catchAsync(async (req, res, next) => {
  const recommendedTracks = await discoveryService.getRecommendedBasedOnLikes(
    req.user._id
  );

  res.status(200).json({
    status: 'success',
    results: recommendedTracks.length,
    data: { tracks: recommendedTracks },
  });
});

exports.getStationByGenre = catchAsync(async (req, res, next) => {
  const { genre } = req.params;
  const tracks = await discoveryService.getStationByGenre(genre);

  res.status(200).json({
    status: 'success',
    results: tracks.length,
    data: { tracks },
  });
});

exports.getStationByArtist = catchAsync(async (req, res, next) => {
  const { artistId } = req.params;
  const tracks = await discoveryService.getStationByArtist(artistId);

  res.status(200).json({
    status: 'success',
    results: tracks.length,
    data: { tracks },
  });
});

exports.getRelatedTracks = catchAsync(async (req, res, next) => {
  const { trackId } = req.params;
  const tracks = await discoveryService.getRelatedTracks(trackId);

  res.status(200).json({
    status: 'success',
    results: tracks.length,
    data: { tracks },
  });
});

exports.getUsersWhoLikedAlsoLiked = catchAsync(async (req, res, next) => {
  const { trackId } = req.params;
  const tracks = await discoveryService.getUsersWhoLikedAlsoLiked(trackId);

  res.status(200).json({
    status: 'success',
    results: tracks.length,
    data: { tracks },
  });
});

// ── New ───────────────────────────────────────────────────────────────────────

// GET /api/discovery/more-like-liked
// Returns up to 20 tracks matching genres the user has liked
// Falls back to trending if the user has no likes yet
exports.getMoreOfWhatYouLike = catchAsync(async (req, res, next) => {
  const result = await discoveryService.getMoreOfWhatYouLike(req.user._id);

  res.status(200).json({
    status: 'success',
    results: result.tracks.length,
    data: {
      tracks: result.tracks,
      basedOn: result.basedOn, // 'likes' | 'trending'
      genres: result.genres, // genres used to build the list
    },
  });
});

// GET /api/discovery/mixed-for-you
// Returns an array of named stations: top genres + liked artist + trending
// Each station has: { id, title, description, type, tracks[] }
exports.getMixedForYou = catchAsync(async (req, res, next) => {
  const stations = await discoveryService.getMixedForYou(req.user._id);

  res.status(200).json({
    status: 'success',
    results: stations.length,
    data: { stations },
  });
});

// GET /api/discovery/curated
// Public endpoint — no auth required
// Returns themed editorial buckets: fresh finds, trending, spotlight, top genres
// Each bucket has: { id, title, description, curatedBy, tracks[] }
exports.getCuratedByPlatform = catchAsync(async (req, res, next) => {
  const curated = await discoveryService.getCuratedByPlatform();

  res.status(200).json({
    status: 'success',
    results: curated.length,
    data: { curated },
  });
});
