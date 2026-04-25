// src/services/adminService.js
const User = require('../models/userModel');
const Track = require('../models/trackModel');
const ListenHistory = require('../models/listenHistoryModel');
const Report = require('../models/reportModel');
const notificationService = require('./notificationService');
const subscriptionService = require('./subscriptionService');
const sendEmail = require('../utils/sendEmail'); // <--- Add this import
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

  // 1. In-app Notification
  await notificationService.notifySystem(
    user._id,
    `OFFICIAL WARNING: ${message}`
  );

  // 2. Email Notification
  try {
    await sendEmail({
      email: user.email,
      subject: 'Official Warning from BioBeats Moderation',
      message: `Hi ${user.displayName || 'User'},\n\nThis is an official warning from the BioBeats Moderation Team.\n\nReason: ${message}\n\nPlease adhere to our community guidelines to avoid account suspension.\n\nRegards,\nThe BioBeats Team`,
    });
  } catch (error) {
    console.error('[Email Error] Failed to send warning email:', error);
  }

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

  // Email Notification
  try {
    await sendEmail({
      email: user.email,
      subject: 'Notice: Your BioBeats Account has been Suspended',
      message: `Hi ${user.displayName || 'User'},\n\nYour account has been suspended due to violations of our Terms of Service. You will no longer be able to log in or interact with the platform.\n\nIf you believe this is a mistake, you can reply to this email to appeal the decision.\n\nRegards,\nThe BioBeats Team`,
    });
  } catch (error) {
    console.error('[Email Error] Failed to send suspension email:', error);
  }

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

  // Email Notification
  try {
    await sendEmail({
      email: user.email,
      subject: 'Update: Your BioBeats Account has been Restored',
      message: `Hi ${user.displayName || 'User'},\n\nGood news! Your account has been reviewed and restored by our moderation team. You can now log back into BioBeats.\n\nWelcome back!\n\nRegards,\nThe BioBeats Team`,
    });
  } catch (error) {
    console.error('[Email Error] Failed to send restore email:', error);
  }

  return user;
};

exports.hideTrack = async (trackId) => {
  // CRITICAL: We must populate the artist to get their email address!
  const track = await Track.findById(trackId).populate('artist');
  if (!track) throw new AppError('Track not found', 404);

  if (track.moderationStatus === 'Hidden_By_Admin') {
    throw new AppError('This track is already hidden.', 400);
  }

  track.moderationStatus = 'Hidden_By_Admin';
  await track.save();

  // Email Notification
  if (track.artist && track.artist.email) {
    try {
      await sendEmail({
        email: track.artist.email,
        subject: 'Notice: Your Track has been Removed',
        message: `Hi ${track.artist.displayName || 'Artist'},\n\nYour track "${track.title}" has been removed from public visibility by our moderation team for violating our content policies (e.g., Copyright or Inappropriate Content).\n\nIf you believe this is a mistake, please reply to this email.\n\nRegards,\nThe BioBeats Team`,
      });
    } catch (error) {
      console.error('[Email Error] Failed to send track hidden email:', error);
    }
  }

  return track;
};

exports.restoreTrack = async (trackId) => {
  // CRITICAL: We must populate the artist to get their email address!
  const track = await Track.findById(trackId).populate('artist');
  if (!track) throw new AppError('Track not found', 404);

  if (track.moderationStatus === 'Approved') {
    throw new AppError('This track is already public and not hidden.', 400);
  }

  track.moderationStatus = 'Approved';
  await track.save();

  // Email Notification
  if (track.artist && track.artist.email) {
    try {
      await sendEmail({
        email: track.artist.email,
        subject: 'Update: Your Track has been Restored',
        message: `Hi ${track.artist.displayName || 'Artist'},\n\nGood news! Your track "${track.title}" has been reviewed and successfully restored to the public feed.\n\nKeep creating!\n\nRegards,\nThe BioBeats Team`,
      });
    } catch (error) {
      console.error('[Email Error] Failed to send track restore email:', error);
    }
  }

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
