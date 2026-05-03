'use strict';
/**
 * 21_adminUtilsValidationBoost.test.js
 *
 * Targets uncovered branches in:
 *  - adminService      (getPlatformAnalytics, getAllTracks filters, getAllUsers filters,
 *                       getDailyActiveUsersSeries, getTopTracksList, sendUserWarning email error,
 *                       suspendAccount already-suspended, restoreAccount already-active,
 *                       hideTrack already-hidden + no-artist-email, restoreTrack already-approved,
 *                       createReport duplicate, getPendingReports with various targetModels,
 *                       broadcastMessageToAll, updateReportStatus)
 *  - validationMiddleware (all runFieldRules branches: type, minLength, maxLength, pattern,
 *                          min, max, maxItems, itemType, enum, custom; validate middleware)
 *  - utils/appError    (4xx vs 5xx status, stack trace capture)
 *  - utils/catchAsync  (passes through resolved value, forwards error to next)
 *  - utils/sendEmail   (getTransporter singleton, sendMail)
 */

// ─── mocks ────────────────────────────────────────────────────────────────────
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

const User             = require('../models/userModel');
const Track            = require('../models/trackModel');
const ListenHistory    = require('../models/listenHistoryModel');
const Report           = require('../models/reportModel');
const notificationSvc  = require('../services/notificationService');
const subscriptionSvc  = require('../services/subscriptionService');
const sendEmail        = require('../utils/sendEmail');

const UID  = '507f1f77bcf86cd799439011';
const TID  = '507f1f77bcf86cd799439033';
const RID  = '507f1f77bcf86cd799439044';

beforeEach(() => {
  jest.clearAllMocks();
  notificationSvc.notifySystem  = jest.fn().mockResolvedValue({});
  sendEmail.mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════
// adminService
// ═══════════════════════════════════════════════════════════
describe('adminService', () => {
  const svc = require('../services/adminService');

  // ── getPlatformAnalytics ────────────────────────────────────
  describe('getPlatformAnalytics', () => {
    beforeEach(() => {
      subscriptionSvc.getRevenueStats = jest.fn().mockResolvedValue({
        activeSubscriptions: 5, totalRevenue: 75,
        proUsersCount: 3, goPlusUsersCount: 2,
        creatorRevenue: 15, listenerRevenue: 20,
      });
      ListenHistory.countDocuments.mockResolvedValue(10);
    });

    test('computes analytics when users exist', async () => {
      User.aggregate.mockResolvedValue([
        { _id: 'Artist', count: 4 },
        { _id: 'Listener', count: 8 },
      ]);
      Track.aggregate.mockResolvedValue([
        { _id: null, totalTracks: 20, totalPlays: 100, totalBytes: 1024 * 1024 * 50 },
      ]);

      const result = await svc.getPlatformAnalytics();
      expect(result.totalUsers).toBe(12);
      expect(result.playThroughRate).toBe('10.00%');
      expect(result.totalStorageUsed).toBe('50.00 MB');
    });

    test('handles zero listeners (ratio = artist count)', async () => {
      User.aggregate.mockResolvedValue([
        { _id: 'Artist', count: 3 },
      ]);
      Track.aggregate.mockResolvedValue([]);

      const result = await svc.getPlatformAnalytics();
      expect(result.artistToListenerRatio).toBe(3);
      expect(result.totalPlays).toBe(0);
      expect(result.playThroughRate).toBe('0%');
    });

    test('handles empty trackStats gracefully', async () => {
      User.aggregate.mockResolvedValue([]);
      Track.aggregate.mockResolvedValue([]);

      const result = await svc.getPlatformAnalytics();
      expect(result.totalTracks).toBe(0);
    });
  });

  // ── getDailyActiveUsersSeries ───────────────────────────────
  describe('getDailyActiveUsersSeries', () => {
    test('calls aggregate with correct date range', async () => {
      ListenHistory.aggregate.mockResolvedValue([
        { _id: { sortDate: '2024-01-01', displayDate: 'Jan 01' }, count: 5 },
      ]);

      const result = await svc.getDailyActiveUsersSeries(7);
      expect(ListenHistory.aggregate).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    test('uses default 30 days when no argument', async () => {
      ListenHistory.aggregate.mockResolvedValue([]);
      await svc.getDailyActiveUsersSeries();
      expect(ListenHistory.aggregate).toHaveBeenCalled();
    });
  });

  // ── getTopTracksList ────────────────────────────────────────
  describe('getTopTracksList', () => {
    test('maps tracks to name/plays format', async () => {
      Track.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([
          { title: 'Hit Song', playCount: 1000 },
          { title: 'Unknown', playCount: undefined },
        ]),
      });

      const result = await svc.getTopTracksList(5);
      expect(result[0]).toEqual({ name: 'Hit Song', plays: 1000 });
      expect(result[1]).toEqual({ name: 'Unknown', plays: 0 }); // undefined -> 0
    });
  });

  // ── getAllTracks ─────────────────────────────────────────────
  describe('getAllTracks', () => {
    const mockFindChain = (data = []) => ({
      populate: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue(data),
    });

    test('returns all tracks with no filters', async () => {
      Track.find.mockReturnValue(mockFindChain([{ title: 'T1' }]));
      Track.countDocuments.mockResolvedValue(1);

      const result = await svc.getAllTracks({ page: 1, limit: 20 });
      expect(result.total).toBe(1);
    });

    test('applies search filter', async () => {
      Track.find.mockReturnValue(mockFindChain([]));
      Track.countDocuments.mockResolvedValue(0);

      await svc.getAllTracks({ search: 'hello' });
      expect(Track.find).toHaveBeenCalledWith(
        expect.objectContaining({ title: { $regex: 'hello', $options: 'i' } })
      );
    });

    test('applies genre filter', async () => {
      Track.find.mockReturnValue(mockFindChain([]));
      Track.countDocuments.mockResolvedValue(0);

      await svc.getAllTracks({ genre: 'Pop' });
      expect(Track.find).toHaveBeenCalledWith(expect.objectContaining({ genre: 'Pop' }));
    });

    test('applies Published status filter (isPublic: true)', async () => {
      Track.find.mockReturnValue(mockFindChain([]));
      Track.countDocuments.mockResolvedValue(0);

      await svc.getAllTracks({ status: 'Published' });
      expect(Track.find).toHaveBeenCalledWith(expect.objectContaining({ isPublic: true }));
    });

    test('applies Draft status filter (isPublic: false)', async () => {
      Track.find.mockReturnValue(mockFindChain([]));
      Track.countDocuments.mockResolvedValue(0);

      await svc.getAllTracks({ status: 'Draft' });
      expect(Track.find).toHaveBeenCalledWith(expect.objectContaining({ isPublic: false }));
    });

    test('applies 7days uploadDate filter', async () => {
      Track.find.mockReturnValue(mockFindChain([]));
      Track.countDocuments.mockResolvedValue(0);

      await svc.getAllTracks({ uploadDate: '7days' });
      expect(Track.find).toHaveBeenCalledWith(
        expect.objectContaining({ createdAt: expect.any(Object) })
      );
    });

    test('applies 30days uploadDate filter', async () => {
      Track.find.mockReturnValue(mockFindChain([]));
      Track.countDocuments.mockResolvedValue(0);

      await svc.getAllTracks({ uploadDate: '30days' });
      expect(Track.find).toHaveBeenCalledWith(
        expect.objectContaining({ createdAt: expect.any(Object) })
      );
    });

    test('ignores "All Time" uploadDate filter', async () => {
      Track.find.mockReturnValue(mockFindChain([]));
      Track.countDocuments.mockResolvedValue(0);

      await svc.getAllTracks({ uploadDate: 'All Time' });
      const callArg = Track.find.mock.calls[0][0];
      expect(callArg.createdAt).toBeUndefined();
    });
  });

  // ── getAllUsers ──────────────────────────────────────────────
  describe('getAllUsers', () => {
    const mockFindChain = (data = []) => ({
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue(data),
    });

    test('returns all users with no filters', async () => {
      User.find.mockReturnValue(mockFindChain([{ displayName: 'Alice' }]));
      User.countDocuments.mockResolvedValue(1);

      const result = await svc.getAllUsers({ page: 1, limit: 20 });
      expect(result.total).toBe(1);
    });

    test('applies search filter', async () => {
      User.find.mockReturnValue(mockFindChain([]));
      User.countDocuments.mockResolvedValue(0);

      await svc.getAllUsers({ search: 'alice' });
      expect(User.find).toHaveBeenCalledWith(
        expect.objectContaining({ $or: expect.any(Array) })
      );
    });

    test('applies status filter', async () => {
      User.find.mockReturnValue(mockFindChain([]));
      User.countDocuments.mockResolvedValue(0);

      await svc.getAllUsers({ status: 'Suspended' });
      expect(User.find).toHaveBeenCalledWith(
        expect.objectContaining({ accountStatus: 'Suspended' })
      );
    });
  });

  // ── sendUserWarning ─────────────────────────────────────────
  describe('sendUserWarning', () => {
    test('throws 404 when user not found', async () => {
      User.findById.mockResolvedValue(null);
      await expect(svc.sendUserWarning(UID, 'Spam')).rejects.toMatchObject({ statusCode: 404 });
    });

    test('sends notification and email on success', async () => {
      User.findById.mockResolvedValue({ _id: UID, displayName: 'DJ', email: 'dj@beats.com' });
      const result = await svc.sendUserWarning(UID, 'You violated TOS');
      expect(notificationSvc.notifySystem).toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalled();
      expect(result.displayName).toBe('DJ');
    });

    test('continues even if email sending fails', async () => {
      User.findById.mockResolvedValue({ _id: UID, displayName: 'DJ', email: 'dj@beats.com' });
      sendEmail.mockRejectedValue(new Error('SMTP down'));
      await expect(svc.sendUserWarning(UID, 'Warning')).resolves.toBeDefined();
    });
  });

  // ── broadcastMessageToAll ────────────────────────────────────
  describe('broadcastMessageToAll', () => {
    test('sends notification to all users and returns count', async () => {
      User.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([{ _id: UID }, { _id: 'u2' }]),
      });

      const result = await svc.broadcastMessageToAll('Hello everyone!', '/news');
      expect(notificationSvc.notifySystem).toHaveBeenCalledTimes(2);
      expect(result).toBe(2);
    });
  });

  // ── suspendAccount ──────────────────────────────────────────
  describe('suspendAccount', () => {
    test('throws 404 when user not found', async () => {
      User.findById.mockResolvedValue(null);
      await expect(svc.suspendAccount(UID, 'u2')).rejects.toMatchObject({ statusCode: 404 });
    });

    test('throws 403 when target is Admin', async () => {
      User.findById.mockResolvedValue({ role: 'Admin', accountStatus: 'Active' });
      await expect(svc.suspendAccount(UID, 'u2')).rejects.toMatchObject({ statusCode: 403 });
    });

    test('throws 400 when already suspended', async () => {
      User.findById.mockResolvedValue({ role: 'Listener', accountStatus: 'Suspended' });
      await expect(svc.suspendAccount(UID, 'u2')).rejects.toMatchObject({ statusCode: 400 });
    });

    test('suspends user and sends email', async () => {
      const user = {
        _id: 'u2', role: 'Listener', accountStatus: 'Active',
        displayName: 'Bob', email: 'bob@test.com',
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(user);

      const result = await svc.suspendAccount(UID, 'u2');
      expect(result.accountStatus).toBe('Suspended');
      expect(sendEmail).toHaveBeenCalled();
    });

    test('continues even if suspension email fails', async () => {
      const user = {
        _id: 'u2', role: 'Listener', accountStatus: 'Active',
        displayName: 'Bob', email: 'bob@test.com',
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(user);
      sendEmail.mockRejectedValue(new Error('SMTP'));

      await expect(svc.suspendAccount(UID, 'u2')).resolves.toBeDefined();
    });
  });

  // ── restoreAccount ──────────────────────────────────────────
  describe('restoreAccount', () => {
    test('throws 404 when user not found', async () => {
      User.findById.mockResolvedValue(null);
      await expect(svc.restoreAccount('u2')).rejects.toMatchObject({ statusCode: 404 });
    });

    test('throws 400 when already active', async () => {
      User.findById.mockResolvedValue({ accountStatus: 'Active' });
      await expect(svc.restoreAccount('u2')).rejects.toMatchObject({ statusCode: 400 });
    });

    test('restores user and sends email', async () => {
      const user = {
        _id: 'u2', accountStatus: 'Suspended',
        displayName: 'Bob', email: 'bob@test.com',
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(user);

      const result = await svc.restoreAccount('u2');
      expect(result.accountStatus).toBe('Active');
      expect(sendEmail).toHaveBeenCalled();
    });

    test('continues even if restore email fails', async () => {
      const user = {
        _id: 'u2', accountStatus: 'Suspended', displayName: 'Bob', email: 'b@t.com',
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(user);
      sendEmail.mockRejectedValue(new Error('SMTP'));

      await expect(svc.restoreAccount('u2')).resolves.toBeDefined();
    });
  });

  // ── hideTrack ───────────────────────────────────────────────
  describe('hideTrack', () => {
    test('throws 404 when track not found', async () => {
      Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
      await expect(svc.hideTrack(TID)).rejects.toMatchObject({ statusCode: 404 });
    });

    test('throws 400 when already hidden', async () => {
      Track.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          moderationStatus: 'Hidden_By_Admin',
          save: jest.fn(),
        }),
      });
      await expect(svc.hideTrack(TID)).rejects.toMatchObject({ statusCode: 400 });
    });

    test('hides track and emails artist', async () => {
      const track = {
        _id: TID, title: 'My Track', moderationStatus: 'Approved',
        artist: { email: 'artist@test.com', displayName: 'DJ', _id: UID },
        save: jest.fn().mockResolvedValue(true),
      };
      Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(track) });

      const result = await svc.hideTrack(TID);
      expect(result.moderationStatus).toBe('Hidden_By_Admin');
      expect(sendEmail).toHaveBeenCalled();
    });

    test('hides track without email when artist has no email', async () => {
      const track = {
        _id: TID, title: 'My Track', moderationStatus: 'Approved',
        artist: null,
        save: jest.fn().mockResolvedValue(true),
      };
      Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(track) });

      const result = await svc.hideTrack(TID);
      expect(result.moderationStatus).toBe('Hidden_By_Admin');
      expect(sendEmail).not.toHaveBeenCalled();
    });

    test('continues even if hide email fails', async () => {
      const track = {
        _id: TID, title: 'T', moderationStatus: 'Approved',
        artist: { email: 'a@t.com', displayName: 'DJ' },
        save: jest.fn().mockResolvedValue(true),
      };
      Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(track) });
      sendEmail.mockRejectedValue(new Error('SMTP'));

      await expect(svc.hideTrack(TID)).resolves.toBeDefined();
    });
  });

  // ── restoreTrack ─────────────────────────────────────────────
  describe('restoreTrack', () => {
    test('throws 404 when track not found', async () => {
      Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
      await expect(svc.restoreTrack(TID)).rejects.toMatchObject({ statusCode: 404 });
    });

    test('throws 400 when track is already public/approved', async () => {
      Track.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue({ moderationStatus: 'Approved', save: jest.fn() }),
      });
      await expect(svc.restoreTrack(TID)).rejects.toMatchObject({ statusCode: 400 });
    });

    test('restores track and emails artist', async () => {
      const track = {
        _id: TID, title: 'My Track', moderationStatus: 'Hidden_By_Admin',
        artist: { email: 'artist@test.com', displayName: 'DJ' },
        save: jest.fn().mockResolvedValue(true),
      };
      Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(track) });

      const result = await svc.restoreTrack(TID);
      expect(result.moderationStatus).toBe('Approved');
      expect(sendEmail).toHaveBeenCalled();
    });

    test('restores without email when no artist email', async () => {
      const track = {
        _id: TID, title: 'T', moderationStatus: 'Hidden_By_Admin',
        artist: null,
        save: jest.fn().mockResolvedValue(true),
      };
      Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(track) });

      const result = await svc.restoreTrack(TID);
      expect(result.moderationStatus).toBe('Approved');
      expect(sendEmail).not.toHaveBeenCalled();
    });

    test('continues even if restore email fails', async () => {
      const track = {
        _id: TID, title: 'T', moderationStatus: 'Hidden_By_Admin',
        artist: { email: 'a@t.com', displayName: 'DJ' },
        save: jest.fn().mockResolvedValue(true),
      };
      Track.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(track) });
      sendEmail.mockRejectedValue(new Error('SMTP'));

      await expect(svc.restoreTrack(TID)).resolves.toBeDefined();
    });
  });

  // ── createReport ────────────────────────────────────────────
  describe('createReport', () => {
    test('throws 400 when report already exists', async () => {
      Report.findOne.mockResolvedValue({ _id: RID });
      await expect(svc.createReport({ targetId: TID, targetModel: 'Track' }, UID))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    test('creates report when no duplicate', async () => {
      Report.findOne.mockResolvedValue(null);
      Report.create.mockResolvedValue({ _id: RID, reporter: UID });

      const result = await svc.createReport({ targetId: TID, targetModel: 'Track', reason: 'spam' }, UID);
      expect(result._id).toBe(RID);
    });
  });

  // ── getPendingReports ────────────────────────────────────────
  describe('getPendingReports', () => {
    test('returns reports with valid targetModel populated', async () => {
      const mockReport = {
        _id: RID, reporter: { displayName: 'Alice' },
        targetModel: 'Track', targetId: TID,
      };
      Report.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockReport]),
      });

      // mongoose.model('Track') is called internally – Track.findById must work
      Track.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: TID, title: 'T' }) });

      const result = await svc.getPendingReports(1, 20);
      expect(result).toHaveLength(1);
    });

    test('sets targetId to null for invalid targetModel', async () => {
      const mockReport = {
        _id: RID, reporter: { displayName: 'Alice' },
        targetModel: 'Unknown', targetId: 'some-id',
      };
      Report.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockReport]),
      });

      const result = await svc.getPendingReports(1, 20);
      expect(result[0].targetId).toBeNull();
    });

    test('sets targetId to null when targetModel is missing', async () => {
      const mockReport = {
        _id: RID, reporter: { displayName: 'Alice' },
        targetModel: null, targetId: TID,
      };
      Report.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockReport]),
      });

      const result = await svc.getPendingReports(1, 20);
      expect(result[0].targetId).toBeNull();
    });
  });

  // ── updateReportStatus ───────────────────────────────────────
  describe('updateReportStatus', () => {
    test('throws 404 when report not found', async () => {
      Report.findByIdAndUpdate.mockResolvedValue(null);
      await expect(svc.updateReportStatus(RID, 'Resolved')).rejects.toMatchObject({ statusCode: 404 });
    });

    test('updates report status', async () => {
      Report.findByIdAndUpdate.mockResolvedValue({ _id: RID, status: 'Resolved' });
      const result = await svc.updateReportStatus(RID, 'Resolved');
      expect(result.status).toBe('Resolved');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// validationMiddleware — runFieldRules all branches
// ═══════════════════════════════════════════════════════════
describe('validationMiddleware', () => {
  const { validate, runFieldRules } = require('../middlewares/validationMiddleware');

  // ── runFieldRules ────────────────────────────────────────────
  describe('runFieldRules', () => {
    // required
    test('returns error when required field is undefined', () => {
      expect(runFieldRules(undefined, { required: true }, 'name')).toBe('name is required');
    });
    test('returns custom requiredMessage', () => {
      expect(runFieldRules(null, { required: true, requiredMessage: 'Name needed' }, 'name')).toBe('Name needed');
    });
    test('returns null for optional empty field', () => {
      expect(runFieldRules(undefined, { required: false }, 'name')).toBeNull();
    });
    test('treats empty string as empty', () => {
      expect(runFieldRules('   ', { required: true }, 'name')).toBe('name is required');
    });

    // type
    test('validates string type correctly', () => {
      expect(runFieldRules('hello', { type: 'string' }, 'name')).toBeNull();
      expect(runFieldRules(123, { type: 'string' }, 'name')).toBe('name must be a valid string');
    });
    test('validates number type correctly', () => {
      expect(runFieldRules(42, { type: 'number' }, 'age')).toBeNull();
      expect(runFieldRules('42', { type: 'number' }, 'age')).toBe('age must be a valid number');
    });
    test('validates boolean type correctly', () => {
      expect(runFieldRules(true, { type: 'boolean' }, 'active')).toBeNull();
      expect(runFieldRules(1, { type: 'boolean' }, 'active')).toBe('active must be a valid boolean');
    });
    test('validates array type correctly', () => {
      expect(runFieldRules([1, 2], { type: 'array' }, 'tags')).toBeNull();
      expect(runFieldRules('not array', { type: 'array' }, 'tags')).toBe('tags must be a valid array');
    });
    test('validates mongoId type correctly', () => {
      expect(runFieldRules('507f1f77bcf86cd799439011', { type: 'mongoId' }, 'id')).toBeNull();
      expect(runFieldRules('bad-id', { type: 'mongoId' }, 'id')).toBe('id must be a valid mongoId');
    });
    test('validates email type correctly', () => {
      expect(runFieldRules('a@b.com', { type: 'email' }, 'email')).toBeNull();
      expect(runFieldRules('bad email', { type: 'email' }, 'email')).toBe('email must be a valid email');
    });
    test('uses custom typeMessage when provided', () => {
      expect(runFieldRules(123, { type: 'string', typeMessage: 'must be text' }, 'name')).toBe('must be text');
    });

    // string-specific
    test('validates minLength', () => {
      expect(runFieldRules('ab', { minLength: 3 }, 'name')).toBe('name must be at least 3 characters');
      expect(runFieldRules('abc', { minLength: 3 }, 'name')).toBeNull();
    });
    test('uses custom minLengthMessage', () => {
      expect(runFieldRules('a', { minLength: 5, minLengthMessage: 'Too short' }, 'name')).toBe('Too short');
    });
    test('validates maxLength', () => {
      expect(runFieldRules('abcdef', { maxLength: 5 }, 'name')).toBe('name must not exceed 5 characters');
      expect(runFieldRules('abc', { maxLength: 5 }, 'name')).toBeNull();
    });
    test('uses custom maxLengthMessage', () => {
      expect(runFieldRules('toolong', { maxLength: 3, maxLengthMessage: 'Too long' }, 'name')).toBe('Too long');
    });
    test('validates pattern', () => {
      expect(runFieldRules('abc123', { pattern: /^\d+$/ }, 'code')).toBe('code format is invalid');
      expect(runFieldRules('123', { pattern: /^\d+$/ }, 'code')).toBeNull();
    });
    test('uses custom patternMessage', () => {
      expect(runFieldRules('abc', { pattern: /^\d+$/, patternMessage: 'Must be numeric' }, 'code')).toBe('Must be numeric');
    });

    // number-specific
    test('validates min', () => {
      expect(runFieldRules(1, { type: 'number', min: 5 }, 'age')).toBe('age must be at least 5');
      expect(runFieldRules(10, { type: 'number', min: 5 }, 'age')).toBeNull();
    });
    test('uses custom minMessage', () => {
      expect(runFieldRules(1, { type: 'number', min: 5, minMessage: 'Too small' }, 'age')).toBe('Too small');
    });
    test('validates max', () => {
      expect(runFieldRules(100, { type: 'number', max: 50 }, 'age')).toBe('age must not exceed 50');
      expect(runFieldRules(30, { type: 'number', max: 50 }, 'age')).toBeNull();
    });
    test('uses custom maxMessage', () => {
      expect(runFieldRules(100, { type: 'number', max: 50, maxMessage: 'Too large' }, 'age')).toBe('Too large');
    });

    // array-specific
    test('validates maxItems', () => {
      expect(runFieldRules([1, 2, 3, 4], { maxItems: 3 }, 'tags')).toBe('tags must not contain more than 3 items');
      expect(runFieldRules([1, 2], { maxItems: 3 }, 'tags')).toBeNull();
    });
    test('uses custom maxItemsMessage', () => {
      expect(runFieldRules([1,2,3,4], { maxItems: 2, maxItemsMessage: 'Limit 2' }, 'tags')).toBe('Limit 2');
    });
    test('validates itemType for array items', () => {
      expect(runFieldRules(['a', 'b'], { itemType: 'string' }, 'tags')).toBeNull();
      expect(runFieldRules(['a', 123], { itemType: 'string' }, 'tags')).toBe('All items in tags must be of type string');
    });
    test('uses custom itemTypeMessage', () => {
      expect(runFieldRules([1, 'x'], { itemType: 'number', itemTypeMessage: 'Must all be numbers' }, 'tags')).toBe('Must all be numbers');
    });
    test('handles unknown itemType as invalid', () => {
      expect(runFieldRules(['a'], { itemType: 'unknown_type' }, 'tags')).toBe('All items in tags must be of type unknown_type');
    });

    // enum
    test('validates enum', () => {
      expect(runFieldRules('d', { enum: ['a', 'b', 'c'] }, 'status')).toBe('status must be one of: a, b, c');
      expect(runFieldRules('a', { enum: ['a', 'b', 'c'] }, 'status')).toBeNull();
    });
    test('uses custom enumMessage', () => {
      expect(runFieldRules('x', { enum: ['a', 'b'], enumMessage: 'Invalid choice' }, 'status')).toBe('Invalid choice');
    });

    // custom validator
    test('calls custom validator and returns its error', () => {
      const custom = (v) => v === 'bad' ? 'Cannot use "bad"' : null;
      expect(runFieldRules('bad', { custom }, 'name')).toBe('Cannot use "bad"');
      expect(runFieldRules('good', { custom }, 'name')).toBeNull();
    });
  });

  // ── validate middleware ─────────────────────────────────────
  describe('validate middleware', () => {
    const schema = {
      body: { name: { required: true, type: 'string' } },
      params: { id: { required: true, type: 'mongoId' } },
      query: { page: { type: 'number', min: 1 } },
    };

    test('calls next() with no error when valid', () => {
      const req = {
        body: { name: 'Alice' },
        params: { id: '507f1f77bcf86cd799439011' },
        query: {},
      };
      const next = jest.fn();
      validate(schema)(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });

    test('calls next(AppError) on first validation failure', () => {
      const req = {
        body: { name: '' },
        params: { id: '507f1f77bcf86cd799439011' },
        query: {},
      };
      const next = jest.fn();
      validate(schema)(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('validates params schema', () => {
      const req = {
        body: { name: 'Alice' },
        params: { id: 'bad-id' },
        query: {},
      };
      const next = jest.fn();
      validate(schema)(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('validates query schema', () => {
      const req = {
        body: { name: 'Alice' },
        params: { id: '507f1f77bcf86cd799439011' },
        query: { page: 0 },
      };
      const next = jest.fn();
      validate(schema)(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('handles missing schema sections gracefully', () => {
      const partialSchema = { body: { name: { required: true } } };
      const req = { body: { name: 'Alice' }, params: {}, query: {} };
      const next = jest.fn();
      validate(partialSchema)(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });
  });
});

// ═══════════════════════════════════════════════════════════
// utils/appError
// ═══════════════════════════════════════════════════════════
describe('AppError', () => {
  const AppError = require('../utils/appError');

  test('sets status to "fail" for 4xx codes', () => {
    const err = new AppError('Not found', 404);
    expect(err.status).toBe('fail');
    expect(err.statusCode).toBe(404);
    expect(err.isOperational).toBe(true);
    expect(err.message).toBe('Not found');
  });

  test('sets status to "error" for 5xx codes', () => {
    const err = new AppError('Server down', 500);
    expect(err.status).toBe('error');
    expect(err.statusCode).toBe(500);
  });

  test('sets status to "error" for 503', () => {
    const err = new AppError('Service unavailable', 503);
    expect(err.status).toBe('error');
  });

  test('sets status to "fail" for 400', () => {
    const err = new AppError('Bad request', 400);
    expect(err.status).toBe('fail');
  });

  test('captures stack trace', () => {
    const err = new AppError('Test', 400);
    expect(err.stack).toBeDefined();
  });

  test('extends Error', () => {
    const err = new AppError('Test', 400);
    expect(err instanceof Error).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// utils/catchAsync
// ═══════════════════════════════════════════════════════════
describe('catchAsync', () => {
  const catchAsync = require('../utils/catchAsync');

  test('calls the wrapped fn with req, res, next and resolves', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const middleware = catchAsync(fn);
    const req = {}, res = {}, next = jest.fn();

    await middleware(req, res, next);
    expect(fn).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next with error when fn rejects', async () => {
    const error = new Error('oops');
    const fn = jest.fn().mockRejectedValue(error);
    const middleware = catchAsync(fn);
    const next = jest.fn();

    await middleware({}, {}, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});

// ═══════════════════════════════════════════════════════════
// errorHandler middleware
// ═══════════════════════════════════════════════════════════
describe('globalErrorHandler', () => {
  const globalErrorHandler = require('../middlewares/errorHandler');

  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  test('sends full error in development mode', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const err = { statusCode: 400, status: 'fail', message: 'Bad request', stack: 'stack' };
    const res = makeRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Bad request' }));
    process.env.NODE_ENV = original;
  });

  test('sends clean error in production for operational error', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const AppError = require('../utils/appError');
    const err = new AppError('Not found', 404);
    const res = makeRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not found' }));
    process.env.NODE_ENV = original;
  });

  test('sends generic 500 in production for non-operational error', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const err = new Error('random bug');
    err.statusCode = 500;
    const res = makeRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Something went wrong. Please try again later.' }));
    process.env.NODE_ENV = original;
  });

  test('handles CastError in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const err = { name: 'CastError', path: '_id', value: 'bad', statusCode: 400, message: 'Cast error', status: 'fail' };
    const res = makeRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'fail' }));
    process.env.NODE_ENV = original;
  });

  test('handles duplicate key error (code 11000) in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const err = { code: 11000, keyValue: { email: 'dup@test.com' }, statusCode: 400, message: 'dup', status: 'fail' };
    const res = makeRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'fail' }));
    process.env.NODE_ENV = original;
  });

  test('handles ValidationError in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const err = {
      name: 'ValidationError',
      errors: { email: { message: 'Email invalid' } },
      statusCode: 400, message: 'validation', status: 'fail',
    };
    const res = makeRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'fail' }));
    process.env.NODE_ENV = original;
  });

  test('handles JsonWebTokenError in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const err = { name: 'JsonWebTokenError', statusCode: 401, message: 'invalid', status: 'fail' };
    const res = makeRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid token. Please log in again.' }));
    process.env.NODE_ENV = original;
  });

  test('handles TokenExpiredError in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const err = { name: 'TokenExpiredError', statusCode: 401, message: 'expired', status: 'fail' };
    const res = makeRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Your session has expired. Please log in again.' }));
    process.env.NODE_ENV = original;
  });

  test('defaults statusCode to 500 when missing', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const err = { message: 'no code' };
    const res = makeRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    process.env.NODE_ENV = original;
  });
});
