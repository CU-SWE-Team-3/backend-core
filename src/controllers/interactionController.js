const interactionService = require('../services/interactionService');
const catchAsync = require('../utils/catchAsync');

exports.createRepost = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { id: trackId } = req.params;
  const result = await interactionService.addRepost(userId, trackId);
  res.status(201).json({
    success: true,
    message: 'Track reposted successfully',
    data: result,
  });
});

exports.deleteRepost = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { id: trackId } = req.params;
  const result = await interactionService.removeRepost(userId, trackId);
  res.status(200).json({
    success: true,
    message: 'Repost removed successfully',
    data: result,
  });
});

exports.getTrackReposters = catchAsync(async (req, res) => {
  const { id: trackId } = req.params;
  const { page, limit } = req.query;
  const result = await interactionService.getTrackEngagers(
    trackId,
    'REPOST',
    page,
    limit
  );
  res.status(200).json({
    success: true,
    message: 'Track reposters fetched successfully',
    data: {
      users: result.users,
      pagination: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
      },
    },
  });
});

exports.getTrackLikers = catchAsync(async (req, res) => {
  const { id: trackId } = req.params;
  const { page, limit } = req.query;
  const result = await interactionService.getTrackEngagers(
    trackId,
    'LIKE',
    page,
    limit
  );
  res.status(200).json({
    success: true,
    message: 'Track likers fetched successfully',
    data: {
      users: result.users,
      pagination: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
      },
    },
  });
});

exports.getUserRepostsFeed = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { page, limit } = req.query;
  const result = await interactionService.getUserReposts(userId, page, limit);
  res.status(200).json({
    success: true,
    message: 'User reposts feed fetched successfully',
    data: {
      repostedTracks: result.repostedTracks,
      pagination: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
      },
    },
  });
});
