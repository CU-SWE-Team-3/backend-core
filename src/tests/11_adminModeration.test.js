'use strict';
/**
 * 11_adminModeration.test.js
 * Module 11: Admin Dashboard & Moderation
 * Tests adminService (real) and adminController (mocked service)
 */

// Mock these BEFORE any require so firebase-admin and stripe don't throw
jest.mock('../services/firebaseService');
jest.mock('stripe', () => () => ({ subscriptions: {}, customers: {}, webhooks: { constructEvent: jest.fn() } }));

jest.mock('../models/userModel');
jest.mock('../models/trackModel');
jest.mock('../models/listenHistoryModel');
jest.mock('../models/reportModel');
jest.mock('../services/notificationService');
jest.mock('../services/subscriptionService');
jest.mock('../utils/sendEmail');

const User = require('../models/userModel');
const Track = require('../models/trackModel');
const ListenHistory = require('../models/listenHistoryModel');
const Report = require('../models/reportModel');
const notificationService = require('../services/notificationService');
const subscriptionService = require('../services/subscriptionService');
const sendEmail = require('../utils/sendEmail');

// Mock adminService for controller tests
jest.mock('../services/adminService');
const adminService = require('../services/adminService');
const adminController = require('../controllers/adminController');

const UID  = '507f1f77bcf86cd799439011';
const TID  = '507f1f77bcf86cd799439022';
const RID  = '507f1f77bcf86cd799439033';

const mkRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json   = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// ─── adminController ──────────────────────────────────────────────────────────
describe('adminController', () => {
  test('getDashboardStats — 200', async () => {
    adminService.getPlatformAnalytics.mockResolvedValue({ totalUsers: 100 });
    const r = mkRes();
    await adminController.getDashboardStats({}, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('suspendUser — 200', async () => {
    adminService.suspendAccount.mockResolvedValue({ _id: UID, accountStatus: 'Suspended' });
    const r = mkRes();
    await adminController.suspendUser({ user: { id: UID }, params: { id: TID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('restoreUser — 200', async () => {
    adminService.restoreAccount.mockResolvedValue({ _id: UID, accountStatus: 'Active' });
    const r = mkRes();
    await adminController.restoreUser({ params: { id: UID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('hideTrackContent — 200', async () => {
    adminService.hideTrack.mockResolvedValue({ _id: TID, moderationStatus: 'Hidden_By_Admin', isPublic: false });
    const r = mkRes();
    await adminController.hideTrackContent({ params: { id: TID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('restoreTrackContent — 200', async () => {
    adminService.restoreTrack.mockResolvedValue({ _id: TID, moderationStatus: 'Approved', isPublic: true });
    const r = mkRes();
    await adminController.restoreTrackContent({ params: { id: TID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('submitReport — 201', async () => {
    adminService.createReport.mockResolvedValue({ _id: RID, reason: 'spam' });
    const r = mkRes();
    await adminController.submitReport({ user: { _id: UID }, body: { targetId: TID, reason: 'spam' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(201);
  });

  test('getReports — 200', async () => {
    adminService.getPendingReports.mockResolvedValue([{ _id: RID }]);
    const r = mkRes();
    await adminController.getReports({ query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ results: 1 }));
  });

  test('resolveReport — 200', async () => {
    adminService.updateReportStatus.mockResolvedValue({ _id: RID, status: 'Resolved' });
    const r = mkRes();
    await adminController.resolveReport({ params: { id: RID }, body: { status: 'Resolved' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('broadcastToAllUsers — 200', async () => {
    adminService.broadcastMessageToAll.mockResolvedValue(50);
    const r = mkRes();
    await adminController.broadcastToAllUsers({ body: { message: 'Hello everyone!', actionLink: null } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('broadcastToAllUsers — 400 when no message', async () => {
    const next = jest.fn();
    await adminController.broadcastToAllUsers({ body: {} }, mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('getAdminTracks — 200', async () => {
    adminService.getAllTracks.mockResolvedValue({ total: 10, pages: 1, data: [] });
    const r = mkRes();
    await adminController.getAdminTracks({ query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getAdminUsers — 200', async () => {
    adminService.getAllUsers.mockResolvedValue({ total: 5, pages: 1, data: [] });
    const r = mkRes();
    await adminController.getAdminUsers({ query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getDailyActiveUsers — 200', async () => {
    adminService.getDailyActiveUsersSeries.mockResolvedValue([{ date: 'Jan 01', activeUsers: 10 }]);
    const r = mkRes();
    await adminController.getDailyActiveUsers({ query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getTopTracks — 200', async () => {
    adminService.getTopTracksList.mockResolvedValue([{ name: 'Beat', plays: 100 }]);
    const r = mkRes();
    await adminController.getTopTracks({ query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('warnUser — 200', async () => {
    adminService.sendUserWarning.mockResolvedValue({ _id: UID });
    const r = mkRes();
    await adminController.warnUser({ params: { id: UID }, body: { message: 'Stop it' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('warnUser — 400 when no message', async () => {
    const next = jest.fn();
    await adminController.warnUser({ params: { id: UID }, body: {} }, mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

// ─── adminService REAL unit tests ────────────────────────────────────────────
describe('adminService (real)', () => {
  jest.unmock('../services/adminService');
  const realAdminService = jest.requireActual('../services/adminService');

  const mkUser = (overrides = {}) => ({
    _id: UID, email: 'user@test.com', displayName: 'DJ', role: 'Listener',
    accountStatus: 'Active', isPremium: false,
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  const mkTrack = (overrides = {}) => ({
    _id: TID, title: 'Beat', moderationStatus: 'Approved', isPublic: true,
    artist: { _id: UID, email: 'artist@test.com', displayName: 'DJ' },
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    sendEmail.mockResolvedValue({});
    notificationService.notifySystem = jest.fn().mockResolvedValue({});
    subscriptionService.getRevenueStats = jest.fn().mockResolvedValue({
      activeSubscriptions: 10, totalRevenue: 150,
      proUsersCount: 5, goPlusUsersCount: 5,
      creatorRevenue: 50, listenerRevenue: 100,
    });
  });

  // ── Analytics ──────────────────────────────────────────────────────────────
  test('getPlatformAnalytics — returns correct structure', async () => {
    User.aggregate.mockResolvedValue([
      { _id: 'Artist', count: 20 },
      { _id: 'Listener', count: 80 },
    ]);
    Track.aggregate.mockResolvedValue([{ totalTracks: 50, totalPlays: 500, totalBytes: 1024 * 1024 }]);
    ListenHistory.countDocuments.mockResolvedValue(300);
    const result = await realAdminService.getPlatformAnalytics();
    expect(result.totalUsers).toBe(100);
    expect(result.artistToListenerRatio).toBeDefined();
    expect(result.totalTracks).toBe(50);
    expect(result.totalPlays).toBe(500);
    expect(result.playThroughRate).toBeDefined();
    expect(result.totalStorageUsed).toBeDefined();
    expect(result.businessInsights).toBeDefined();
  });

  test('getPlatformAnalytics — handles empty track stats gracefully', async () => {
    User.aggregate.mockResolvedValue([]);
    Track.aggregate.mockResolvedValue([]);
    ListenHistory.countDocuments.mockResolvedValue(0);
    const result = await realAdminService.getPlatformAnalytics();
    expect(result.totalUsers).toBe(0);
    expect(result.playThroughRate).toBe('0%');
  });

  test('getDailyActiveUsersSeries — calls ListenHistory.aggregate', async () => {
    ListenHistory.aggregate.mockResolvedValue([{ date: 'Jan 01', activeUsers: 5 }]);
    const result = await realAdminService.getDailyActiveUsersSeries(7);
    expect(Array.isArray(result)).toBe(true);
    expect(ListenHistory.aggregate).toHaveBeenCalled();
  });

  test('getTopTracksList — returns top tracks by play count', async () => {
    Track.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([{ title: 'Hit', playCount: 1000 }]),
    });
    const result = await realAdminService.getTopTracksList(5);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Hit');
    expect(result[0].plays).toBe(1000);
  });

  // ── Content & User Lists ───────────────────────────────────────────────────
  test('getAllTracks — returns paginated track list', async () => {
    Track.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([mkTrack()]),
    });
    Track.countDocuments.mockResolvedValue(1);
    const result = await realAdminService.getAllTracks({ page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  test('getAllTracks — applies search filter', async () => {
    Track.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([]),
    });
    Track.countDocuments.mockResolvedValue(0);
    await realAdminService.getAllTracks({ page: 1, limit: 20, search: 'beat' });
    expect(Track.find).toHaveBeenCalledWith(expect.objectContaining({ title: expect.any(Object) }));
  });

  test('getAllTracks — applies genre filter', async () => {
    Track.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([]),
    });
    Track.countDocuments.mockResolvedValue(0);
    await realAdminService.getAllTracks({ page: 1, limit: 20, genre: 'Electronic' });
    expect(Track.find).toHaveBeenCalledWith(expect.objectContaining({ genre: 'Electronic' }));
  });

  test('getAllTracks — applies Published status filter', async () => {
    Track.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([]),
    });
    Track.countDocuments.mockResolvedValue(0);
    await realAdminService.getAllTracks({ page: 1, limit: 20, status: 'Published' });
    expect(Track.find).toHaveBeenCalledWith(expect.objectContaining({ isPublic: true }));
  });

  test('getAllTracks — applies uploadDate 7days filter', async () => {
    Track.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([]),
    });
    Track.countDocuments.mockResolvedValue(0);
    await realAdminService.getAllTracks({ page: 1, limit: 20, uploadDate: '7days' });
    const filterArg = Track.find.mock.calls[0][0];
    expect(filterArg.createdAt).toBeDefined();
  });

  test('getAllUsers — returns paginated user list', async () => {
    User.find.mockReturnValue({
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([mkUser()]),
    });
    User.countDocuments.mockResolvedValue(1);
    const result = await realAdminService.getAllUsers({ page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  test('getAllUsers — applies search and status filters', async () => {
    User.find.mockReturnValue({
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([]),
    });
    User.countDocuments.mockResolvedValue(0);
    await realAdminService.getAllUsers({ page: 1, limit: 20, search: 'DJ', status: 'Active' });
    const filterArg = User.find.mock.calls[0][0];
    expect(filterArg.$or).toBeDefined();
    expect(filterArg.accountStatus).toBe('Active');
  });

  // ── Moderation ─────────────────────────────────────────────────────────────
  test('sendUserWarning — sends in-app and email notification', async () => {
    User.findById.mockResolvedValue(mkUser());
    const result = await realAdminService.sendUserWarning(UID, 'Spamming');
    expect(notificationService.notifySystem).toHaveBeenCalledWith(UID, expect.stringContaining('OFFICIAL WARNING'));
    expect(sendEmail).toHaveBeenCalled();
  });

  test('sendUserWarning — throws 404 when user not found', async () => {
    User.findById.mockResolvedValue(null);
    await expect(realAdminService.sendUserWarning(UID, 'msg')).rejects.toThrow('User not found');
  });

  test('sendUserWarning — continues if email fails', async () => {
    User.findById.mockResolvedValue(mkUser());
    sendEmail.mockRejectedValue(new Error('SMTP'));
    const result = await realAdminService.sendUserWarning(UID, 'Warning');
    expect(result).toBeDefined();
  });

  test('broadcastMessageToAll — sends to all users and returns count', async () => {
    User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: 'u1' }, { _id: 'u2' }]) });
    notificationService.notifySystem.mockResolvedValue({});
    const count = await realAdminService.broadcastMessageToAll('Hello all!', null);
    expect(count).toBe(2);
    expect(notificationService.notifySystem).toHaveBeenCalledTimes(2);
  });

  test('suspendAccount — suspends active user', async () => {
    const user = mkUser({ role: 'Listener', accountStatus: 'Active' });
    User.findById.mockResolvedValue(user);
    const result = await realAdminService.suspendAccount(UID, TID);
    expect(result.accountStatus).toBe('Suspended');
    expect(user.save).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalled();
  });

  test('suspendAccount — throws 404 when user not found', async () => {
    User.findById.mockResolvedValue(null);
    await expect(realAdminService.suspendAccount(UID, TID)).rejects.toThrow('User not found');
  });

  test('suspendAccount — throws 403 when target is Admin', async () => {
    User.findById.mockResolvedValue(mkUser({ role: 'Admin' }));
    await expect(realAdminService.suspendAccount(UID, TID)).rejects.toThrow('Cannot suspend another admin');
  });

  test('suspendAccount — throws 400 when already suspended', async () => {
    User.findById.mockResolvedValue(mkUser({ accountStatus: 'Suspended' }));
    await expect(realAdminService.suspendAccount(UID, TID)).rejects.toThrow('already suspended');
  });

  test('suspendAccount — continues if email fails', async () => {
    User.findById.mockResolvedValue(mkUser());
    sendEmail.mockRejectedValue(new Error('SMTP'));
    const result = await realAdminService.suspendAccount(UID, TID);
    expect(result.accountStatus).toBe('Suspended');
  });

  test('restoreAccount — restores suspended user', async () => {
    const user = mkUser({ accountStatus: 'Suspended' });
    User.findById.mockResolvedValue(user);
    const result = await realAdminService.restoreAccount(UID);
    expect(result.accountStatus).toBe('Active');
    expect(user.save).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalled();
  });

  test('restoreAccount — throws 404 when user not found', async () => {
    User.findById.mockResolvedValue(null);
    await expect(realAdminService.restoreAccount(UID)).rejects.toThrow('User not found');
  });

  test('restoreAccount — throws 400 when already active', async () => {
    User.findById.mockResolvedValue(mkUser({ accountStatus: 'Active' }));
    await expect(realAdminService.restoreAccount(UID)).rejects.toThrow('already active');
  });

  test('restoreAccount — continues if email fails', async () => {
    User.findById.mockResolvedValue(mkUser({ accountStatus: 'Suspended' }));
    sendEmail.mockRejectedValue(new Error('SMTP'));
    const result = await realAdminService.restoreAccount(UID);
    expect(result.accountStatus).toBe('Active');
  });

  test('hideTrack — hides approved track', async () => {
    const track = mkTrack();
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(track) });
    const result = await realAdminService.hideTrack(TID);
    expect(result.moderationStatus).toBe('Hidden_By_Admin');
    expect(track.save).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalled();
  });

  test('hideTrack — throws 404 when track not found', async () => {
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    await expect(realAdminService.hideTrack(TID)).rejects.toThrow('Track not found');
  });

  test('hideTrack — throws 400 when already hidden', async () => {
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mkTrack({ moderationStatus: 'Hidden_By_Admin' })) });
    await expect(realAdminService.hideTrack(TID)).rejects.toThrow('already hidden');
  });

  test('hideTrack — continues if email fails', async () => {
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mkTrack()) });
    sendEmail.mockRejectedValue(new Error('SMTP'));
    const result = await realAdminService.hideTrack(TID);
    expect(result.moderationStatus).toBe('Hidden_By_Admin');
  });

  test('restoreTrack — restores hidden track', async () => {
    const track = mkTrack({ moderationStatus: 'Hidden_By_Admin' });
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(track) });
    const result = await realAdminService.restoreTrack(TID);
    expect(result.moderationStatus).toBe('Approved');
    expect(track.save).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalled();
  });

  test('restoreTrack — throws 404 when track not found', async () => {
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    await expect(realAdminService.restoreTrack(TID)).rejects.toThrow('Track not found');
  });

  test('restoreTrack — throws 400 when already public', async () => {
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mkTrack({ moderationStatus: 'Approved' })) });
    await expect(realAdminService.restoreTrack(TID)).rejects.toThrow('already public');
  });

  test('restoreTrack — continues if email fails', async () => {
    Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(mkTrack({ moderationStatus: 'Hidden_By_Admin' })) });
    sendEmail.mockRejectedValue(new Error('SMTP'));
    const result = await realAdminService.restoreTrack(TID);
    expect(result.moderationStatus).toBe('Approved');
  });

  // ── Report system ──────────────────────────────────────────────────────────
  test('createReport — creates a new report', async () => {
    Report.findOne.mockResolvedValue(null);
    Report.create.mockResolvedValue({ _id: RID, reason: 'spam' });
    const result = await realAdminService.createReport({ targetId: TID, reason: 'spam' }, UID);
    expect(result._id).toBe(RID);
  });

  test('createReport — throws 400 when duplicate report', async () => {
    Report.findOne.mockResolvedValue({ _id: RID });
    await expect(realAdminService.createReport({ targetId: TID }, UID)).rejects.toThrow('already reported');
  });

  test('getPendingReports — returns pending reports list', async () => {
    const mockReport = { _id: RID, targetId: TID, targetModel: 'Track', reporter: { displayName: 'User' } };
    Report.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mockReport]),
    });
    // Mock mongoose.model for dynamic population
    const mongoose = require('mongoose');
    mongoose.model = jest.fn().mockReturnValue({ findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: TID, title: 'Beat' }) }) });
    const result = await realAdminService.getPendingReports(1, 20);
    expect(Array.isArray(result)).toBe(true);
  });

  test('getPendingReports — sets targetId to null for unknown targetModel', async () => {
    const mockReport = { _id: RID, targetId: TID, targetModel: 'UnknownModel', reporter: { displayName: 'User' } };
    Report.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mockReport]),
    });
    const result = await realAdminService.getPendingReports(1, 20);
    expect(result[0].targetId).toBeNull();
  });

  test('updateReportStatus — updates report status', async () => {
    Report.findByIdAndUpdate.mockResolvedValue({ _id: RID, status: 'Resolved' });
    const result = await realAdminService.updateReportStatus(RID, 'Resolved');
    expect(result.status).toBe('Resolved');
  });

  test('updateReportStatus — throws 404 when report not found', async () => {
    Report.findByIdAndUpdate.mockResolvedValue(null);
    await expect(realAdminService.updateReportStatus(RID, 'Resolved')).rejects.toThrow('Report not found');
  });
});
