// src/controllers/notificationController.js
const Notification = require('../models/notificationModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// ==========================================
// 1. Fetch Notification Feed
// ==========================================
exports.getNotifications = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  if (!userId) return next(new AppError('User ID is required', 400));
  // NEW: Add pagination queries
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const notifications = await Notification.find({ recipient: userId })
    .sort('-updatedAt')
    .skip(skip)
    .limit(limit)
    .populate('actors', 'displayName avatarUrl permalink')
    .populate('target', 'title permalink');

  const total = await Notification.countDocuments({ recipient: userId });

  res.status(200).json({
    success: true,
    data: {
      notifications,
      pagination: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

// ==========================================
// 2. Fetch Unread Badge Count
// ==========================================
exports.getUnreadCount = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  if (!userId) return next(new AppError('User ID is required', 400));

  // Highly optimized MongoDB query that only returns an integer
  const unreadCount = await Notification.countDocuments({
    recipient: userId,
    isRead: false,
  });

  res.status(200).json({
    success: true,
    data: {
      unreadCount,
    },
  });
});

// ==========================================
// 3. Mark All Notifications As Read
// ==========================================
exports.markAllAsRead = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  if (!userId) return next(new AppError('User ID is required', 400));

  // Efficiently updates all unread notifications to read in a single DB sweep
  const result = await Notification.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true } }
  );

  res.status(200).json({
    success: true,
    message: 'All notifications successfully marked as read',
    data: {
      modifiedCount: result.modifiedCount,
    },
  });
});
// Add this new function to your controller
exports.markOneAsRead = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  const { id } = req.params;

  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipient: userId }, // Ensure the user actually owns this notification!
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }

  res.status(200).json({
    success: true,
    data: { notification },
  });
});
// ==========================================
// 4. Delete a Specific Notification
// ==========================================
exports.deleteNotification = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  const { id } = req.params;

  const notification = await Notification.findOneAndDelete({
    _id: id,
    recipient: userId, // Ensure they only delete their own notifications!
  });

  if (!notification) {
    return next(
      new AppError(
        'Notification not found or you do not have permission to delete it',
        404
      )
    );
  }

  res.status(204).json({
    success: true,
    data: null,
  });
});
