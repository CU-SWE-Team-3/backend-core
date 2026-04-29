// src/controllers/notificationController.js
const notificationService = require('../services/notificationService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
// ==========================================
// 1. Fetch Notification Feed
// ==========================================
exports.getNotifications = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  if (!userId) return next(new AppError('User ID is required', 400));

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;

  // Hand off to the service layer
  const data = await notificationService.getUserNotifications(
    userId,
    page,
    limit
  );

  res.status(200).json({
    success: true,
    data, // Contains { notifications, pagination }
  });
});

// ==========================================
// 2. Fetch Unread Badge Count
// ==========================================
exports.getUnreadCount = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  if (!userId) return next(new AppError('User ID is required', 400));

  // Hand off to the service layer
  const unreadCount = await notificationService.getUnreadCount(userId);

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

  // Hand off to the service layer
  const modifiedCount = await notificationService.markAllAsRead(userId);

  res.status(200).json({
    success: true,
    message: 'All notifications successfully marked as read',
    data: {
      modifiedCount,
    },
  });
});

// ==========================================
// 4. Mark One Notification As Read
// ==========================================
exports.markOneAsRead = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  const { id } = req.params;

  // Hand off to the service layer
  const notification = await notificationService.markOneAsRead(userId, id);

  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }

  res.status(200).json({
    success: true,
    data: { notification },
  });
});

// ==========================================
// 5. Delete a Specific Notification
// ==========================================
exports.deleteNotification = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  const { id } = req.params;

  // Hand off to the service layer
  const notification = await notificationService.deleteNotification(userId, id);

  if (!notification) {
    return next(
      new AppError(
        'Notification not found or you do not have permission to delete it',
        404
      )
    );
  }

  res.status(200).json({
    success: true,
    message: 'Notification deleted successfully.',
  });
});
// ==========================================
// 6. Register Device Token (FCM)
// ==========================================
exports.registerFcmToken = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  const { token } = req.body;

  if (!token) return next(new AppError('FCM Token is required', 400));

  await notificationService.addFcmToken(userId, token);

  res.status(200).json({
    success: true,
    message: 'Device registered for push notifications',
  });
});

exports.removeFcmToken = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  const { token } = req.body;

  if (!token) return next(new AppError('FCM Token is required', 400));

  await notificationService.removeFcmToken(userId, token);

  res.status(200).json({
    success: true,
    message: 'Device unregistered',
  });
});

exports.getPreferences = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  if (!userId) return next(new AppError('User ID is required', 400));

  const settings = await notificationService.getPreferences(userId);

  res.status(200).json({
    success: true,
    data: settings,
  });
});

exports.updatePreferences = catchAsync(async (req, res, next) => {
  const userId = (req.user && req.user.id) || req.user._id;
  if (!userId) return next(new AppError('User ID is required', 400));

  const updatedSettings = await notificationService.updatePreferences(
    userId,
    req.body
  );

  res.status(200).json({
    success: true,
    data: updatedSettings,
  });
});
