const Comment = require('../models/commentModel');
const Track = require('../models/trackModel');
const AppError = require('../utils/appError');
const notificationService = require('./notificationService'); // Add this line
const User = require('../models/userModel');
const Block = require('../models/blockModel');

exports.addComment = async (
  userId,
  trackId,
  content,
  timestamp,
  parentCommentId = null
) => {
  const track = await Track.findById(trackId);
  if (!track) throw new AppError('Track not found', 404);

  if (!track.allowComments) {
    throw new AppError('Comments are disabled for this track', 403);
  }
  // ---> NEW TRUST & SAFETY CHECK (Using Block Model) <---
  // Check if either user has blocked the other
  const blockRecord = await Block.findOne({
    $or: [
      { blocker: track.artist, blocked: userId }, // The Artist blocked the Commenter/Liker
      { blocker: userId, blocked: track.artist }, // The Commenter/Liker blocked the Artist
    ],
  });

  if (blockRecord) {
    throw new AppError(
      'You are blocked from interacting with this user (or you have blocked them).',
      403
    );
  }
  // -------------------------------------------------------
  // Ensure parent comment is valid
  let parent = null;
  if (parentCommentId) {
    parent = await Comment.findById(parentCommentId);
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

  // ==========================================
  // MODULE 10: NOTIFICATION TRIGGERS
  // ==========================================

  // 1. Always notify the track artist (unless they are the ones commenting)
  if (track.artist.toString() !== userId.toString()) {
    notificationService.notifyComment(track.artist, userId, trackId, content);
  }

  // 2. NEW: If this is a reply, notify the person they are replying to!
  if (parent && parent.user.toString() !== userId.toString()) {
    // Note: You may want to add a `notifyReply` function to your notificationService
    // or just reuse notifyComment but target the parent.user
    notificationService.notifyComment(parent.user, userId, trackId, content);
  }
  // ==========================================
  // MODULE 10: @MENTION NOTIFICATIONS
  // ==========================================
  // Extract all strings starting with '@' (e.g., @john_doe)
  const mentionRegex = /@([a-zA-Z0-9_.-]+)/g;
  const mentions = content.match(mentionRegex);

  if (mentions && mentions.length > 0) {
    const permalinks = mentions.map((m) => m.substring(1)); // Remove the '@'

    // Find all users that match these permalinks

    const mentionedUsers = await User.find({ permalink: { $in: permalinks } });

    mentionedUsers.forEach((mentionedUser) => {
      // Don't notify them if they mentioned themselves or if they are already getting the "Artist" notification
      if (
        mentionedUser._id.toString() !== userId.toString() &&
        mentionedUser._id.toString() !== track.artist.toString()
      ) {
        notificationService.notifyMention(
          mentionedUser._id, // The person mentioned
          userId, // The person who wrote the comment
          trackId // The track where it happened
        );
      }
    });
  }

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

  // 1. Assign the update to a variable so we can access the track's artist ID
  const track = await Track.findByIdAndUpdate(comment.track, {
    $inc: { commentCount: -deletedCount },
  });

  // ==========================================
  // MODULE 10: RETRACT NOTIFICATION
  // Remove the "User X commented on your track" notification
  // ==========================================
  if (track) {
    // Ensure imported at the top
    notificationService.retractNotification(
      track.artist,
      userId,
      'COMMENT',
      track._id
    );
  }
};
