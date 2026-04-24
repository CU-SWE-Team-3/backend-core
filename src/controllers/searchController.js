const searchService = require('../services/searchService');
const catchAsync = require('../utils/catchAsync');

// 🌟 BONUS: Autocomplete Controller
exports.autocomplete = catchAsync(async (req, res, next) => {
  const { q } = req.query;
  if (!q) {
    return res
      .status(400)
      .json({
        status: 'fail',
        message: 'Query (q) is required for autocomplete',
      });
  }

  const results = await searchService.autocompleteSearch(q);
  res.status(200).json({ status: 'success', data: results });
});

exports.globalSearch = catchAsync(async (req, res, next) => {
  // 🌟 BONUS: Added licenseType to extracted query params
  const { q, type, licenseType } = req.query;
  const limit = Number(req.query.limit) || 10;
  const page = Number(req.query.page) || 1;
  const skip = (page - 1) * limit;

  const currentUserId = req.user ? req.user._id : null;

  if (!q) {
    return res
      .status(400)
      .json({ status: 'fail', message: 'Search query (q) is required' });
  }

  // Pass { licenseType } to the service
  const searchResults = await searchService.performGlobalSearch(
    q,
    type,
    limit,
    skip,
    currentUserId,
    { licenseType }
  );

  const totalResults =
    (searchResults.tracks?.length || 0) +
    (searchResults.users?.length || 0) +
    (searchResults.playlists?.length || 0);

  res.status(200).json({
    status: 'success',
    results: totalResults,
    data: searchResults,
  });
});
