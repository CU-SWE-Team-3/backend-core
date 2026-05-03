'use strict';
/**
 * 14_adminService.test.js
 * Deep coverage of adminService — all branches and edge cases
 */

jest.mock('stripe', () => {
  return jest.fn().mockReturnValue({
    webhooks: {
      constructEvent: jest.fn()
    }
  });
});

jest.mock('../models/userModel');
jest.mock('../models/trackModel');
jest.mock('../models/listenHistoryModel');
jest.mock('../models/reportModel');
jest.mock('../services/notificationService');
jest.mock('../services/subscriptionService');
jest.mock('../utils/sendEmail');
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  const modelStore = new Map();
  const makeModel = () => ({
    aggregate: jest.fn(),
    countDocuments: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    create: jest.fn()
  });

  return {
    ...actual,
    model: jest.fn((name) => {
      if (!modelStore.has(name)) {
        modelStore.set(name, makeModel());
      }
      return modelStore.get(name);
    })
  };
});

const User = require('../models/userModel');
const Track = require('../models/trackModel');
const ListenHistory = require('../models/listenHistoryModel');
const Report = require('../models/reportModel');
const notificationService = require('../services/notificationService');
const subscriptionService = require('../services/subscriptionService');
const sendEmail = require('../utils/sendEmail');
const mongoose = require('mongoose');

const adminService = require('../services/adminService');

const UID = '507f1f77bcf86cd799439011';
const TID = '507f1f77bcf86cd799439022';
const RID = '507f1f77bcf86cd799439033';

const mkUser = (overrides = {}) => ({
  _id: UID,
  email: 'admin@beats.com',
  displayName: 'Admin User',
  role: 'Listener',
  accountStatus: 'Active',
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const mkTrack = (overrides = {}) => ({
  _id: TID,
  title: 'Test Track',
  artist: { _id: UID, email: 'artist@beats.com', displayName: 'DJ Artist' },
  moderationStatus: 'Approved',
  isPublic: true,
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  sendEmail.mockResolvedValue(undefined);
  notificationService.notifySystem = jest.fn().mockResolvedValue(true);
  subscriptionService.getRevenueStats = jest.fn().mockResolvedValue({
    activeSubscriptions: 10, totalRevenue: 100,
    proUsersCount: 5, goPlusUsersCount: 5,
    creatorRevenue: 25, listenerRevenue: 75,
  });
});

// ─── getPlatformAnalytics ─────────────────────────────────────────────────────
describe('getPlatformAnalytics', () => {
  test('returns platform analytics with no tracks', async () => {
    User.aggregate.mockResolvedValue([
      { _id: 'Artist', count: 10 },
      { _id: 'Listener', count: 50 },
    ]);
    Track.aggregate.mockResolvedValue([]);
    ListenHistory.countDocuments.mockResolvedValue(0);

    const result = await adminService.getPlatformAnalytics();
    expect(result.totalUsers).toBe(60);
    expect(result.totalTracks).toBe(0);
    expect(result.playThroughRate).toBe('0%');
  });

  test('calculates play-through rate when totalPlays > 0', async () => {
    User.aggregate.mockResolvedValue([{ _id: 'Listener', count: 100 }]);
    Track.aggregate.mockResolvedValue([{ totalTracks: 50, totalPlays: 200, totalBytes: 1024 * 1024 * 100 }]);
    ListenHistory.countDocuments.mockResolvedValue(100);

    const result = await adminService.getPlatformAnalytics();
    expect(result.playThroughRate).toBe('50.00%');
    expect(result.totalStorageUsed).toContain('MB');
  });

  test('calculates artistToListenerRatio', async () => {
    User.aggregate.mockResolvedValue([
      { _id: 'Artist', count: 5 },
      { _id: 'Listener', count: 10 },
    ]);
    Track.aggregate.mockResolvedValue([{ totalTracks: 10, totalPlays: 100, totalBytes: 0 }]);
    ListenHistory.countDocuments.mockResolvedValue(50);

    const result = await adminService.getPlatformAnalytics();
    expect(result.artistToListenerRatio).toBe('0.50');
  });

  test('handles zero listeners for ratio', async () => {
    User.aggregate.mockResolvedValue([{ _id: 'Artist', count: 5 }]);
    Track.aggregate.mockResolvedValue([{ totalTracks: 5, totalPlays: 0, totalBytes: 0 }]);
    ListenHistory.countDocuments.mockResolvedValue(0);

    const result = await adminService.getPlatformAnalytics();
    expect(result.artistToListenerRatio).toBe(5); // totalArtists fallback
  });
});

// ─── getDailyActiveUsersSeries ────────────────────────────────────────────────
describe('getDailyActiveUsersSeries', () => {
  test('calls ListenHistory aggregate with date filter', async () => {
    ListenHistory.aggregate.mockResolvedValue([{ date: 'Apr 30', activeUsers: 100 }]);
    const result = await adminService.getDailyActiveUsersSeries(7);
    expect(result).toHaveLength(1);
    expect(ListenHistory.aggregate).toHaveBeenCalled();
  });

  test('uses default 30 days', async () => {
    ListenHistory.aggregate.mockResolvedValue([]);
    await adminService.getDailyActiveUsersSeries();
    expect(ListenHistory.aggregate).toHaveBeenCalled();
  });
});

// ─── getTopTracksList ─────────────────────────────────────────────────────────
describe('getTopTracksList', () => {
  test('returns mapped track list', async () => {
    const chain = { sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), select: jest.fn().mockResolvedValue([{ title: 'Hit', playCount: 100 }]) };
    Track.find.mockReturnValue(chain);
    const result = await adminService.getTopTracksList(5);
    expect(result[0]).toEqual({ name: 'Hit', plays: 100 });
  });

  test('handles tracks with no playCount', async () => {
    const chain = { sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), select: jest.fn().mockResolvedValue([{ title: 'New', playCount: undefined }]) };
    Track.find.mockReturnValue(chain);
    const result = await adminService.getTopTracksList();
    expect(result[0].plays).toBe(0);
  });
});

// ─── getAllTracks ─────────────────────────────────────────────────────────────
describe('getAllTracks', () => {
  const makeTrackChain = (data = []) => {
    const chain = { populate: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue(data) };
    return chain;
  };

  test('returns paginated tracks with default params', async () => {
    Track.find.mockReturnValue(makeTrackChain([mkTrack()]));
    Track.countDocuments.mockResolvedValue(1);
    const result = await adminService.getAllTracks({});
    expect(result.total).toBe(1);
  });

  test('applies search filter', async () => {
    Track.find.mockReturnValue(makeTrackChain([]));
    Track.countDocuments.mockResolvedValue(0);
    await adminService.getAllTracks({ search: 'test', genre: 'Pop' });
    expect(Track.find).toHaveBeenCalledWith(expect.objectContaining({
      title: { $regex: 'test', $options: 'i' },
      genre: 'Pop',
    }));
  });

  test('applies Published status filter', async () => {
    Track.find.mockReturnValue(makeTrackChain([]));
    Track.countDocuments.mockResolvedValue(0);
    await adminService.getAllTracks({ status: 'Published' });
    expect(Track.find).toHaveBeenCalledWith(expect.objectContaining({ isPublic: true }));
  });

  test('applies Draft status filter', async () => {
    Track.find.mockReturnValue(makeTrackChain([]));
    Track.countDocuments.mockResolvedValue(0);
    await adminService.getAllTracks({ status: 'Draft' });
    expect(Track.find).toHaveBeenCalledWith(expect.objectContaining({ isPublic: false }));
  });

  test('applies 7days upload date filter', async () => {
    Track.find.mockReturnValue(makeTrackChain([]));
    Track.countDocuments.mockResolvedValue(0);
    await adminService.getAllTracks({ uploadDate: '7days' });
    expect(Track.find).toHaveBeenCalledWith(expect.objectContaining({ createdAt: expect.any(Object) }));
  });

  test('applies 30days upload date filter', async () => {
    Track.find.mockReturnValue(makeTrackChain([]));
    Track.countDocuments.mockResolvedValue(0);
    await adminService.getAllTracks({ uploadDate: '30days' });
    expect(Track.find).toHaveBeenCalledWith(expect.objectContaining({ createdAt: expect.any(Object) }));
  });

  test('ignores All Time uploadDate filter', async () => {
    Track.find.mockReturnValue(makeTrackChain([]));
    Track.countDocuments.mockResolvedValue(0);
    await adminService.getAllTracks({ uploadDate: 'All Time' });
    expect(Track.find).toHaveBeenCalledWith(expect.not.objectContaining({ createdAt: expect.any(Object) }));
  });
});

// ─── getAllUsers ──────────────────────────────────────────────────────────────
describe('getAllUsers', () => {
  const makeUserChain = (data = []) => {
    return { skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue(data) };
  };

  test('returns paginated users', async () => {
    User.find.mockReturnValue(makeUserChain([mkUser()]));
    User.countDocuments.mockResolvedValue(1);
    const result = await adminService.getAllUsers({});
    expect(result.total).toBe(1);
  });

  test('applies search filter', async () => {
    User.find.mockReturnValue(makeUserChain([]));
    User.countDocuments.mockResolvedValue(0);
    await adminService.getAllUsers({ search: 'dj' });
    expect(User.find).toHaveBeenCalledWith(expect.objectContaining({ $or: expect.any(Array) }));
  });

  test('applies status filter', async () => {
    User.find.mockReturnValue(makeUserChain([]));
    User.countDocuments.mockResolvedValue(0);
    await adminService.getAllUsers({ status: 'Suspended' });
    expect(User.find).toHaveBeenCalledWith(expect.objectContaining({ accountStatus: 'Suspended' }));
  });
});

// ─── sendUserWarning ──────────────────────────────────────────────────────────
describe('sendUserWarning', () => {
  test('sends in-app and email warning', async () => {
    User.findById.mockResolvedValue(mkUser());
    await adminService.sendUserWarning(UID, 'Inappropriate content');
    expect(notificationService.notifySystem).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalled();
  });

  test('throws 404 when user not found', async () => {
    User.findById.mockResolvedValue(null);
    await expect(adminService.sendUserWarning(UID, 'Warning')).rejects.toThrow('User not found');
  });

  test('silently continues when email fails', async () => {
    User.findById.mockResolvedValue(mkUser());
    sendEmail.mockRejectedValue(new Error('SMTP fail'));
    await expect(adminService.sendUserWarning(UID, 'Warning')).resolves.toBeDefined();
  });
});

// ─── broadcastMessageToAll ────────────────────────────────────────────────────
describe('broadcastMessageToAll', () => {
  test('broadcasts to all users', async () => {
    const users = [{ _id: UID }, { _id: '2' }];
    User.find.mockReturnValue({ select: jest.fn().mockResolvedValue(users) });
    const result = await adminService.broadcastMessageToAll('Platform update', 'http://link.com');
    expect(result).toBe(2);
    expect(notificationService.notifySystem).toHaveBeenCalledTimes(2);
  });

  test('broadcasts without actionLink', async () => {
    User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: UID }]) });
    await adminService.broadcastMessageToAll('Hello');
    expect(notificationService.notifySystem).toHaveBeenCalledWith(UID, 'Hello', undefined);
  });
});

// ─── suspendAccount ───────────────────────────────────────────────────────────
describe('suspendAccount', () => {
  test('suspends active user', async () => {
    const user = mkUser({ accountStatus: 'Active' });
    User.findById.mockResolvedValue(user);
    const result = await adminService.suspendAccount('adminId', UID);
    expect(result.accountStatus).toBe('Suspended');
    expect(sendEmail).toHaveBeenCalled();
  });

  test('throws 404 when user not found', async () => {
    User.findById.mockResolvedValue(null);
    await expect(adminService.suspendAccount('adminId', UID)).rejects.toThrow('User not found');
  });

  test('throws 403 when trying to suspend admin', async () => {
    User.findById.mockResolvedValue(mkUser({ role: 'Admin' }));
    await expect(adminService.suspendAccount('adminId', UID)).rejects.toThrow('Cannot suspend another admin');
  });

  test('throws 400 when user already suspended', async () => {
    User.findById.mockResolvedValue(mkUser({ accountStatus: 'Suspended' }));
    await expect(adminService.suspendAccount('adminId', UID)).rejects.toThrow('already suspended');
  });

  test('silently continues when suspension email fails', async () => {
    User.findById.mockResolvedValue(mkUser({ accountStatus: 'Active' }));
    sendEmail.mockRejectedValue(new Error('SMTP'));
    await expect(adminService.suspendAccount('adminId', UID)).resolves.toBeDefined();
  });
});

// ─── restoreAccount ───────────────────────────────────────────────────────────
describe('restoreAccount', () => {
  test('restores suspended user', async () => {
    const user = mkUser({ accountStatus: 'Suspended' });
    User.findById.mockResolvedValue(user);
    const result = await adminService.restoreAccount(UID);
    expect(result.accountStatus).toBe('Active');
  });

  test('throws 404 when user not found', async () => {
    User.findById.mockResolvedValue(null);
    await expect(adminService.restoreAccount(UID)).rejects.toThrow('User not found');
  });

  test('throws 400 when user already active', async () => {
    User.findById.mockResolvedValue(mkUser({ accountStatus: 'Active' }));
    await expect(adminService.restoreAccount(UID)).rejects.toThrow('already active');
  });

  test('silently continues when restore email fails', async () => {
    User.findById.mockResolvedValue(mkUser({ accountStatus: 'Suspended' }));
    sendEmail.mockRejectedValue(new Error('SMTP'));
    await expect(adminService.restoreAccount(UID)).resolves.toBeDefined();
  });
});

// ─── hideTrack ────────────────────────────────────────────────────────────────
describe('hideTrack', () => {
  test('hides track and emails artist', async () => {
    const chain = { populate: jest.fn().mockResolvedValue(mkTrack()) };
    Track.findById.mockReturnValue(chain);
    const result = await adminService.hideTrack(TID);
    expect(result.moderationStatus).toBe('Hidden_By_Admin');
    expect(sendEmail).toHaveBeenCalled();
  });

  test('throws 404 when track not found', async () => {
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    await expect(adminService.hideTrack(TID)).rejects.toThrow('Track not found');
  });

  test('throws 400 when already hidden', async () => {
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mkTrack({ moderationStatus: 'Hidden_By_Admin' })) });
    await expect(adminService.hideTrack(TID)).rejects.toThrow('already hidden');
  });

  test('silently continues when email fails', async () => {
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mkTrack()) });
    sendEmail.mockRejectedValue(new Error('SMTP'));
    await expect(adminService.hideTrack(TID)).resolves.toBeDefined();
  });

  test('skips email when artist has no email', async () => {
    const track = mkTrack({ artist: { _id: UID, email: null, displayName: 'DJ' } });
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(track) });
    await adminService.hideTrack(TID);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('skips email when no artist populated', async () => {
    const track = mkTrack({ artist: null });
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(track) });
    await adminService.hideTrack(TID);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ─── restoreTrack ─────────────────────────────────────────────────────────────
describe('restoreTrack', () => {
  test('restores hidden track', async () => {
    const track = mkTrack({ moderationStatus: 'Hidden_By_Admin' });
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(track) });
    const result = await adminService.restoreTrack(TID);
    expect(result.moderationStatus).toBe('Approved');
  });

  test('throws 404 when track not found', async () => {
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    await expect(adminService.restoreTrack(TID)).rejects.toThrow('Track not found');
  });

  test('throws 400 when track already approved', async () => {
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mkTrack({ moderationStatus: 'Approved' })) });
    await expect(adminService.restoreTrack(TID)).rejects.toThrow('already public');
  });

  test('silently continues when restore email fails', async () => {
    const track = mkTrack({ moderationStatus: 'Hidden_By_Admin' });
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(track) });
    sendEmail.mockRejectedValue(new Error('SMTP'));
    await expect(adminService.restoreTrack(TID)).resolves.toBeDefined();
  });
});

// ─── createReport ─────────────────────────────────────────────────────────────
describe('createReport', () => {
  test('creates report when none exists', async () => {
    Report.findOne.mockResolvedValue(null);
    Report.create.mockResolvedValue({ _id: RID, reporter: UID });
    const result = await adminService.createReport({ targetId: TID, reason: 'spam' }, UID);
    expect(result._id).toBe(RID);
  });

  test('throws 400 when duplicate report', async () => {
    Report.findOne.mockResolvedValue({ _id: RID });
    await expect(adminService.createReport({ targetId: TID }, UID)).rejects.toThrow('already reported');
  });
});

// ─── getPendingReports ────────────────────────────────────────────────────────
describe('getPendingReports', () => {
  test('returns pending reports with populated targetId', async () => {
    const report = { _id: RID, targetId: TID, targetModel: 'Track', reporter: UID };
    const chain = {
      populate: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([report]),
    };
    Report.find.mockReturnValue(chain);
    const MockModel = { findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: TID, title: 'Track' }) }) };
    mongoose.model.mockReturnValue(MockModel);

    const result = await adminService.getPendingReports(1, 20);
    expect(result).toHaveLength(1);
  });

  test('handles unknown targetModel by setting targetId to null', async () => {
    const report = { _id: RID, targetId: TID, targetModel: 'Unknown', reporter: UID };
    const chain = {
      populate: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([report]),
    };
    Report.find.mockReturnValue(chain);

    const result = await adminService.getPendingReports();
    expect(result[0].targetId).toBeNull();
  });

  test('handles mongoose model lookup error gracefully', async () => {
    const report = { _id: RID, targetId: TID, targetModel: 'Track', reporter: UID };
    const chain = {
      populate: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([report]),
    };
    Report.find.mockReturnValue(chain);
    mongoose.model.mockImplementation(() => { throw new Error('Model error'); });

    const result = await adminService.getPendingReports();
    expect(result[0].targetId).toBeNull();
  });
});

// ─── updateReportStatus ───────────────────────────────────────────────────────
describe('updateReportStatus', () => {
  test('updates report status', async () => {
    Report.findByIdAndUpdate.mockResolvedValue({ _id: RID, status: 'Resolved' });
    const result = await adminService.updateReportStatus(RID, 'Resolved');
    expect(result.status).toBe('Resolved');
  });

  test('throws 404 when report not found', async () => {
    Report.findByIdAndUpdate.mockResolvedValue(null);
    await expect(adminService.updateReportStatus(RID, 'Resolved')).rejects.toThrow('Report not found');
  });
});
