const Comment = require('../models/commentModel');
const Track = require('../models/trackModel');
const AppError = require('../utils/appError');

exports.addComment = async (
  userId,
  trackId,
  content,
  timestamp,
  parentCommentId = null
) => {
  const track = await Track.findById(trackId);
  if (!track) throw new AppError('Track not found', 404);

  // Ensure parent comment (if provided) is valid and belongs to the same track, and that replies are only one level deep
  if (parentCommentId) {
    const parent = await Comment.findById(parentCommentId);
    if (!parent) throw new AppError('Parent comment not found', 404);
    if (parent.parentComment)
      throw new AppError('Replies are restricted to one level deep', 400);
    if (parent.track.toString() !== trackId)
      throw new AppError('Parent comment belongs to a different track', 400);
  }

  const newComment = await Comment.create({
    user: userId,
    track: trackId,
    content,
    timestamp,
    parentComment: parentCommentId || null,
  });

  await Track.findByIdAndUpdate(trackId, { $inc: { commentCount: 1 } });
  return newComment;
};

exports.getTrackComments = async (trackId, page = 1, limit = 50) => {
  const skip = (page - 1) * limit;

  // Fetch top-level comments and populate their replies virtually
  const comments = await Comment.find({ track: trackId, parentComment: null })
    .sort({ timestamp: 1, createdAt: 1 }) // Order by where they appear on the audio waveform
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'user',
      select: 'displayName permalink avatarUrl role isPremium',
    })
    .populate({
      path: 'replies',
      populate: {
        path: 'user',
        select: 'displayName permalink avatarUrl role isPremium',
      },
      options: { sort: { createdAt: 1 } },
    });

  const total = await Comment.countDocuments({
    track: trackId,
    parentComment: null,
  });
  return {
    comments,
    total,
    page: parseInt(page, 10),
    totalPages: Math.ceil(total / limit),
  };
};

exports.deleteComment = async (userId, commentId) => {
  const comment = await Comment.findById(commentId);
  if (!comment) throw new AppError('Comment not found', 404);

  // Ensure only the author can delete it
  if (comment.user.toString() !== userId.toString()) {
    throw new AppError(
      'You do not have permission to delete this comment',
      403
    );
  }

  // If it's a parent comment, delete its replies first
  let deletedCount = 1;
  if (!comment.parentComment) {
    const replies = await Comment.deleteMany({ parentComment: comment._id });
    deletedCount += replies.deletedCount;
  }

  await Comment.deleteOne({ _id: comment._id });
  await Track.findByIdAndUpdate(comment.track, {
    $inc: { commentCount: -deletedCount },
  });
};
