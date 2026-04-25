// src/controllers/adminController.js
const adminService = require('../services/adminService');
const catchAsync = require('../utils/catchAsync');
const notificationService = require('../services/notificationService');
const User = require('../models/userModel');
const AppError = require('../utils/appError');

exports.getDashboardStats = catchAsync(async (req, res, next) => {
  const stats = await adminService.getPlatformAnalytics();
  res.status(200).json({ success: true, data: stats });
});

exports.suspendUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const user = await adminService.suspendAccount(req.user.id, id);
  res.status(200).json({
    success: true,
    message: 'User suspended successfully',
    data: { userId: user._id, status: user.accountStatus },
  });
});

exports.hideTrackContent = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const track = await adminService.hideTrack(id);
  res.status(200).json({
    success: true,
    message: 'Track hidden from public feed',
    data: {
      trackId: track._id,
      isPublic: track.isPublic,
      moderationStatus: track.moderationStatus,
    },
  });
});

exports.submitReport = catchAsync(async (req, res, next) => {
  const newReport = await adminService.createReport(req.body, req.user._id);
  res.status(201).json({
    success: true,
    message: 'Report submitted successfully',
    data: newReport,
  });
});

exports.getReports = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;
  const reports = await adminService.getPendingReports(
    Number(page),
    Number(limit)
  );
  res
    .status(200)
    .json({ success: true, results: reports.length, data: reports });
});

exports.resolveReport = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;
  const report = await adminService.updateReportStatus(id, status);
  res.status(200).json({
    success: true,
    message: `Report marked as ${status}`,
    data: report,
  });
});

exports.restoreUser = catchAsync(async (req, res, next) => {
  const user = await adminService.restoreAccount(req.params.id);
  res.status(200).json({
    success: true,
    message: 'User restored',
    data: { userId: user._id, status: user.accountStatus },
  });
});

exports.restoreTrackContent = catchAsync(async (req, res, next) => {
  const track = await adminService.restoreTrack(req.params.id);
  res.status(200).json({
    success: true,
    message: 'Track restored to public',
    data: {
      trackId: track._id,
      isPublic: track.isPublic,
      moderationStatus: track.moderationStatus,
    },
  });
});

// --- REFACTORED: Logic moved to Service ---
exports.broadcastToAllUsers = catchAsync(async (req, res, next) => {
  const { message, actionLink } = req.body;

  if (!message) {
    return next(new AppError('Broadcast message is required.', 400));
  }

  // Pass the data to the Service to handle the business logic
  const usersCount = await adminService.broadcastMessageToAll(
    message,
    actionLink
  );

  // Send the response
  res.status(200).json({
    success: true,
    message: `System broadcast successfully sent to ${usersCount} users.`,
  });
});

// --- LISTS & DASHBOARD APIs ---
exports.getAdminTracks = catchAsync(async (req, res, next) => {
  const result = await adminService.getAllTracks(req.query);
  res.status(200).json({ success: true, ...result });
});

exports.getAdminUsers = catchAsync(async (req, res, next) => {
  const result = await adminService.getAllUsers(req.query);
  res.status(200).json({ success: true, ...result });
});

exports.getDailyActiveUsers = catchAsync(async (req, res, next) => {
  const stats = await adminService.getDailyActiveUsersSeries(req.query.days);
  res.status(200).json({ success: true, data: stats });
});

exports.getTopTracks = catchAsync(async (req, res, next) => {
  const tracks = await adminService.getTopTracksList(req.query.limit);
  res.status(200).json({ success: true, data: tracks });
});

exports.warnUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { message } = req.body;

  if (!message) {
    return next(new AppError('A warning message is required', 400));
  }

  await adminService.sendUserWarning(id, message);
  res.status(200).json({
    success: true,
    message: 'Official warning sent to user successfully',
  });
});
