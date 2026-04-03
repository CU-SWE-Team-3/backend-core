const commentService = require('../services/commentService');
const catchAsync = require('../utils/catchAsync');

exports.createComment = catchAsync(async (req, res) => {
  const { content, timestamp, parentCommentId } = req.body;
  const comment = await commentService.addComment(
    req.user.id,
    req.params.trackId,
    content,
    timestamp,
    parentCommentId
  );

  res.status(201).json({
    success: true,
    message: 'Comment added successfully',
    data: { comment },
  });
});

exports.getTrackComments = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await commentService.getTrackComments(
    req.params.trackId,
    page,
    limit
  );

  res.status(200).json({
    success: true,
    message: 'Comments fetched successfully',
    data: result,
  });
});

exports.deleteComment = catchAsync(async (req, res) => {
  await commentService.deleteComment(req.user.id, req.params.commentId);
  res.status(200).json({
    success: true,
    message: 'Comment deleted successfully',
  });
});
