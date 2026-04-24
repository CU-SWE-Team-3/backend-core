const feedService = require('../services/feedService');
const catchAsync = require('../utils/catchAsync');

exports.getActivityFeed = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const cursor = req.query.cursor || null;
  const limit = parseInt(req.query.limit, 10) || 40;

  const { feedActivities, nextCursor } = await feedService.getUserFeed(
    userId,
    cursor,
    limit
  );

  res.status(200).json({
    status: 'success',
    results: feedActivities.length,
    data: {
      feed: feedActivities,
      pagination: { nextCursor, hasMore: nextCursor !== null },
    },
  });
});
