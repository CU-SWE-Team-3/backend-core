// src/services/adminService.js
const User = require('../models/userModel');
const Track = require('../models/trackModel');
const ListenHistory = require('../models/listenHistoryModel');
const Report = require('../models/reportModel');
const AppError = require('../utils/appError');

exports.getPlatformAnalytics = async () => {
  // 1. Total Users and Artist-to-Listener Ratio [cite: 304]
  const userStats = await User.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
      },
    },
  ]);

  let totalUsers = 0;
  let totalArtists = 0;
  let totalListeners = 0;

  userStats.forEach((stat) => {
    totalUsers += stat.count;
    if (stat._id === 'Artist') totalArtists = stat.count;
    if (stat._id === 'Listener') totalListeners = stat.count;
  });

  const artistToListenerRatio =
    totalListeners > 0
      ? (totalArtists / totalListeners).toFixed(2)
      : totalArtists;

  // 2. Track Stats: Total Tracks, Total Plays, Total Storage [cite: 305, 306, 308]
  const trackStats = await Track.aggregate([
    {
      $group: {
        _id: null,
        totalTracks: { $sum: 1 },
        totalPlays: { $sum: '$playCount' },
        totalStorageBytes: { $sum: '$size' },
      },
    },
  ]);

  const tStats = trackStats[0] || {
    totalTracks: 0,
    totalPlays: 0,
    totalStorageBytes: 0,
  };
  const totalStorageMB = (tStats.totalStorageBytes / (1024 * 1024)).toFixed(2);

  // 3. Play Through Rate
  // Formula: (Total Plays / Completed Plays) * 100
  // Note: A completed play is recorded in ListenHistory with isPlayCounted = true.
  const completedPlaysCount = await ListenHistory.countDocuments({
    isPlayCounted: true,
  });

  let playThroughRate = 0;
  if (completedPlaysCount > 0) {
    playThroughRate = ((tStats.totalPlays / completedPlaysCount) * 100).toFixed(
      2
    );
  }

  return {
    totalUsers,
    roleBreakdown: { artists: totalArtists, listeners: totalListeners },
    artistToListenerRatio,
    totalTracks: tStats.totalTracks,
    totalPlays: tStats.totalPlays,
    completedPlays: completedPlaysCount,
    playThroughRate: `${playThroughRate}%`,
    totalStorageUsed: `${totalStorageMB} MB`,
  };
};

exports.suspendAccount = async (adminId, userIdToSuspend) => {
  const user = await User.findById(userIdToSuspend);
  if (!user) throw new AppError('User not found', 404);
  if (user.role === 'Admin')
    throw new AppError('Cannot suspend another admin', 403);

  // ADDED CHECK: Prevent redundant database saves
  if (user.accountStatus === 'Suspended') {
    throw new AppError('This user is already suspended.', 400);
  }

  // Suspend user
  user.accountStatus = 'Suspended';
  await user.save();
  return user;
};

exports.hideTrack = async (trackId) => {
  const track = await Track.findById(trackId);
  if (!track) throw new AppError('Track not found', 404);

  // CHANGED: We now check the admin moderation field
  if (track.moderationStatus === 'Hidden_By_Admin') {
    throw new AppError('This track is already hidden.', 400);
  }

  // CHANGED: Admin only changes the moderation field
  track.moderationStatus = 'Hidden_By_Admin';
  await track.save();
  return track;
};

exports.createReport = async (reportData, reporterId) => {
  // 1. Check for duplicates (Business Logic)
  const existingReport = await Report.findOne({
    reporter: reporterId,
    targetId: reportData.targetId,
  });

  if (existingReport) {
    throw new AppError('You have already reported this content.', 400);
  }

  // 2. Create the report
  return await Report.create({
    ...reportData,
    reporter: reporterId,
  });
};

exports.getPendingReports = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  return await Report.find({ status: 'Pending' })
    .populate('reporter', 'displayName permalink')
    .populate('targetId')
    .skip(skip)
    .limit(limit)
    .sort('-createdAt');
};

exports.updateReportStatus = async (reportId, status) => {
  const report = await Report.findByIdAndUpdate(
    reportId,
    { status },
    { new: true, runValidators: true }
  );
  if (!report) throw new AppError('Report not found', 404);
  return report;
};

// Bonus: Un-suspend and Un-hide
exports.restoreAccount = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  // ADDED CHECK
  if (user.accountStatus === 'Active') {
    throw new AppError('This user is already active.', 400);
  }

  user.accountStatus = 'Active';
  await user.save();
  return user;
};

// Restore Track (Admin action)
exports.restoreTrack = async (trackId) => {
  const track = await Track.findById(trackId);
  if (!track) throw new AppError('Track not found', 404);

  // CHANGED: We now check the admin moderation field
  if (track.moderationStatus === 'Approved') {
    throw new AppError('This track is already public and not hidden.', 400);
  }

  // CHANGED: Admin restores the moderation field
  track.moderationStatus = 'Approved';
  await track.save();
  return track;
};
