// src/services/adminService.js
const User = require('../models/userModel');
const Track = require('../models/trackModel');
const ListenHistory = require('../models/listenHistoryModel');
const Report = require('../models/reportModel');
const notificationService = require('./notificationService');
const subscriptionService = require('./subscriptionService');
const AppError = require('../utils/appError');

// ============================================================================
// 1. DASHBOARD & ANALYTICS (Module 12: SoundCloud-Style Business Model)
// ============================================================================

exports.getPlatformAnalytics = async () => {
  // --- 1. Total Users and Artist-to-Listener Ratio ---
  const userStats = await User.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]);

  let totalUsers = 0,
    totalArtists = 0,
    totalListeners = 0;

  userStats.forEach((stat) => {
    totalUsers += stat.count;
    if (stat._id === 'Artist') totalArtists = stat.count;
    if (stat._id === 'Listener') totalListeners = stat.count;
  });

  const artistToListenerRatio =
    totalListeners > 0
      ? (totalArtists / totalListeners).toFixed(2)
      : totalArtists;

  // --- 2. Track Stats ---
  const trackStats = await Track.aggregate([
    {
      $group: {
        _id: null,
        totalTracks: { $sum: 1 },
        totalPlays: { $sum: '$playCount' },
      },
    },
  ]);

  // --- 3. Subscriptions & Revenue (Best Practice: Fetched from Subscription Service) ---
  // هنا احنا بنكلم الـ Service المختصة عشان نجيب الداتا، من غير ما نعرف الأسعار جوا الـ Admin
  const subStats = await subscriptionService.getRevenueStats();

  return {
    // General Platform Stats
    totalUsers,
    artistToListenerRatio,
    totalTracks: trackStats[0]?.totalTracks || 0,
    totalPlays: trackStats[0]?.totalPlays || 0,

    // Core Financials
    activeSubscriptions: subStats.activeSubscriptions,
    totalRevenue: subStats.totalRevenue,

    // Detailed SoundCloud-Style Breakdown
    businessInsights: {
      subscriptions: {
        proCreators: subStats.proUsersCount,
        goPlusListeners: subStats.goPlusUsersCount,
      },
      revenue: {
        fromCreators: subStats.creatorRevenue,
        fromListeners: subStats.listenerRevenue,
      },
    },
  };
};

exports.getDailyActiveUsersSeries = async (days = 30) => {
  const dateLimit = new Date();
  dateLimit.setDate(dateLimit.getDate() - Number(days));

  return await ListenHistory.aggregate([
    { $match: { playedAt: { $gte: dateLimit } } },
    {
      $group: {
        _id: {
          sortDate: {
            $dateToString: { format: '%Y-%m-%d', date: '$playedAt' },
          },
          displayDate: {
            $dateToString: { format: '%b %d', date: '$playedAt' },
          },
          user: '$user',
        },
      },
    },
    {
      $group: {
        _id: { sortDate: '$_id.sortDate', displayDate: '$_id.displayDate' },
        activeUsers: { $sum: 1 },
      },
    },
    { $sort: { '_id.sortDate': 1 } },
    { $project: { _id: 0, date: '$_id.displayDate', activeUsers: 1 } },
  ]);
};

exports.getTopTracksList = async (limit = 10) => {
  const tracks = await Track.find()
    .sort('-playCount')
    .limit(Number(limit))
    .select('title playCount');
  return tracks.map((t) => ({ name: t.title, plays: t.playCount || 0 }));
};

// ============================================================================
// 2. CONTENT & USER MANAGEMENT LISTS
// ============================================================================

exports.getAllTracks = async (query) => {
  const { page = 1, limit = 20, search, genre, status, uploadDate } = query;

  const safePage = Math.max(1, Number(page)); // 1. إنشاء الرقم الآمن
  const skip = (safePage - 1) * Number(limit); // 2. استخدام الرقم الآمن هنا ✅

  let filter = {};

  if (search) filter.title = { $regex: search, $options: 'i' };
  if (genre) filter.genre = genre;
  if (status === 'Published') filter.isPublic = true;
  if (status === 'Draft') filter.isPublic = false;

  if (uploadDate && uploadDate !== 'All Time') {
    const date = new Date();
    date.setHours(0, 0, 0, 0); // <--- Best Practice: Start of the day
    if (uploadDate === '7days') date.setDate(date.getDate() - 7);
    if (uploadDate === '30days') date.setDate(date.getDate() - 30);
    filter.createdAt = { $gte: date };
  }

  const tracks = await Track.find(filter)
    .populate('artist', 'displayName permalink')
    .skip(skip)
    .limit(Number(limit))
    .sort('-createdAt');

  const total = await Track.countDocuments(filter);
  return { total, pages: Math.ceil(total / Number(limit)), data: tracks };
};

exports.getAllUsers = async (query) => {
  const { page = 1, limit = 20, search, status } = query;

  const safePage = Math.max(1, Number(page));
  const skip = (safePage - 1) * Number(limit);

  let filter = {};

  if (search) {
    filter.$or = [
      { displayName: { $regex: search, $options: 'i' } },
      { permalink: { $regex: search, $options: 'i' } },
    ];
  }
  if (status) filter.accountStatus = status;

  const users = await User.find(filter)
    .skip(skip)
    .limit(Number(limit))
    .sort('-createdAt');

  const total = await User.countDocuments(filter);
  return { total, pages: Math.ceil(total / Number(limit)), data: users };
};

// ============================================================================
// 3. MODERATION & ACTIONS
// ============================================================================

exports.sendUserWarning = async (userId, message) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  await notificationService.notifySystem(
    user._id,
    `OFFICIAL WARNING: ${message}`
  );
  return user;
};

// --- REFACTORED BROADCAST LOGIC ---
exports.broadcastMessageToAll = async (message, actionLink) => {
  // Fetch ALL user IDs from the database (optimized with .select)
  const users = await User.find({}).select('_id');

  // Trigger system notification for all
  const broadcastPromises = users.map((user) =>
    notificationService.notifySystem(user._id, message, actionLink)
  );

  await Promise.all(broadcastPromises);

  return users.length; // Return the count to the controller
};

exports.suspendAccount = async (adminId, userIdToSuspend) => {
  const user = await User.findById(userIdToSuspend);
  if (!user) throw new AppError('User not found', 404);
  if (user.role === 'Admin')
    throw new AppError('Cannot suspend another admin', 403);

  if (user.accountStatus === 'Suspended') {
    throw new AppError('This user is already suspended.', 400);
  }

  user.accountStatus = 'Suspended';
  await user.save();
  return user;
};

exports.restoreAccount = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  if (user.accountStatus === 'Active') {
    throw new AppError('This user is already active.', 400);
  }

  user.accountStatus = 'Active';
  await user.save();
  return user;
};

exports.hideTrack = async (trackId) => {
  const track = await Track.findById(trackId);
  if (!track) throw new AppError('Track not found', 404);

  if (track.moderationStatus === 'Hidden_By_Admin') {
    throw new AppError('This track is already hidden.', 400);
  }

  track.moderationStatus = 'Hidden_By_Admin';
  await track.save();
  return track;
};

exports.restoreTrack = async (trackId) => {
  const track = await Track.findById(trackId);
  if (!track) throw new AppError('Track not found', 404);

  if (track.moderationStatus === 'Approved') {
    throw new AppError('This track is already public and not hidden.', 400);
  }

  track.moderationStatus = 'Approved';
  await track.save();
  return track;
};

// ============================================================================
// 4. REPORT SYSTEM
// ============================================================================

exports.createReport = async (reportData, reporterId) => {
  const existingReport = await Report.findOne({
    reporter: reporterId,
    targetId: reportData.targetId,
  });

  if (existingReport) {
    throw new AppError('You have already reported this content.', 400);
  }

  return await Report.create({
    ...reportData,
    reporter: reporterId,
  });
};

exports.getPendingReports = async (page = 1, limit = 20) => {
  const safePage = Math.max(1, Number(page));
  const skip = (safePage - 1) * Number(limit);

  return await Report.find({ status: 'Pending' })
    .populate('reporter', 'displayName permalink')
    .populate('targetId')
    .skip(skip)
    .limit(Number(limit))
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
