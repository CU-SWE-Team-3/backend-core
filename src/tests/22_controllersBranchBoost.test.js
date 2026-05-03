'use strict';
/**
 * 22_controllersBranchBoost.test.js
 *
 * Targets uncovered branches in controllers (currently 71.42% branches):
 *  - authController       (missing refreshToken branches, missing email/password, forgotPassword silent catch)
 *  - adminController      (missing broadcastToAllUsers no-message, warnUser no-message)
 *  - messageController    (all missing-field branches, markAsRead 0 path)
 *  - notificationController (userId missing branches, notification not found)
 *  - stationController    (missing userId branches)
 *  - searchController     (missing q branches)
 *  - profileController    (missing userId branches, missing files branch)
 *  - playlistController   (missing file branch)
 *  - trackController      (missing isPublic branch, missing file branch)
 *  - discoveryController  (all branches covered via service mock)
 *  - historyController    (missing trackId/progress branch)
 *  - subscriptionController (all branches)
 *  - webhookController    (all branches)
 */

// ─── service mocks ────────────────────────────────────────────────────────────
jest.mock('stripe', () => {
  return jest.fn().mockReturnValue({
    webhooks: {
      constructEvent: jest.fn(),
    },
  });
});

jest.mock('../services/authService');
jest.mock('../services/adminService');
jest.mock('../services/messageService');
jest.mock('../services/notificationService');
jest.mock('../services/stationService');
jest.mock('../services/searchService');
jest.mock('../services/profileService');
jest.mock('../services/playlistService');
jest.mock('../services/trackService');
jest.mock('../services/discoveryService');
jest.mock('../services/playbackService');
jest.mock('../services/subscriptionService');

const authService = require('../services/authService');
const adminService = require('../services/adminService');
const messageService = require('../services/messageService');
const notificationService = require('../services/notificationService');
const stationService = require('../services/stationService');
const searchService = require('../services/searchService');
const profileService = require('../services/profileService');
const playlistService = require('../services/playlistService');
const trackService = require('../services/trackService');
const discoveryService = require('../services/discoveryService');
const playbackService = require('../services/playbackService');
const subscriptionService = require('../services/subscriptionService');

const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const messageController = require('../controllers/messageController');
const notificationController = require('../controllers/notificationController');
const stationController = require('../controllers/stationController');
const searchController = require('../controllers/searchController');
const profileController = require('../controllers/profileController');
const playlistController = require('../controllers/playlistController');
const trackController = require('../controllers/trackController');
const discoveryController = require('../controllers/discoveryController');
const historyController = require('../controllers/historyController');
const subscriptionController = require('../controllers/subscriptionController');

// ─── helpers ──────────────────────────────────────────────────────────────────
const mkRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.cookie = jest.fn().mockReturnValue(r);
  r.clearCookie = jest.fn().mockReturnValue(r);
  r.redirect = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  return r;
};

const UID = '507f1f77bcf86cd799439011';
const TID = '507f1f77bcf86cd799439022';
const CID = '507f1f77bcf86cd799439033';
const USER = {
  _id: UID,
  id: UID,
  displayName: 'Test',
  permalink: 'test',
  role: 'Artist',
  isEmailVerified: true,
};

beforeEach(() => jest.clearAllMocks());

// ═══════════════════════════════════════════════════════════
// authController — uncovered branches
// ═══════════════════════════════════════════════════════════
describe('authController', () => {
  describe('refreshToken', () => {
    test('returns 400 when no refreshToken provided', async () => {
      const next = jest.fn();
      await authController.refreshToken(
        { cookies: {}, body: {} },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('reads refreshToken from cookies', async () => {
      authService.verifyRefreshToken = jest.fn().mockResolvedValue({
        token: 'acc',
        refreshToken: 'ref',
        user: USER,
      });
      const r = mkRes();
      await authController.refreshToken(
        { cookies: { refreshToken: 'tok' }, body: {} },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });

    test('reads refreshToken from body when no cookie', async () => {
      authService.verifyRefreshToken = jest.fn().mockResolvedValue({
        token: 'acc',
        refreshToken: 'ref',
        user: USER,
      });
      const r = mkRes();
      await authController.refreshToken(
        { cookies: {}, body: { refreshToken: 'tok' } },
        r,
        jest.fn()
      );
      expect(authService.verifyRefreshToken).toHaveBeenCalledWith('tok');
    });
  });

  describe('login', () => {
    test('returns 400 when email or password missing', async () => {
      const next = jest.fn();
      authController.login({ body: { email: 'a@b.com' } }, mkRes(), next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 400 when both missing', async () => {
      const next = jest.fn();
      authController.login({ body: {} }, mkRes(), next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });

  describe('handleGoogleCallback', () => {
    test('returns 400 when code is missing', async () => {
      const next = jest.fn();
      authController.handleGoogleCallback({ query: {} }, mkRes(), next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });

  describe('loginWithGoogleMobile', () => {
    test('returns 400 when idToken is missing', async () => {
      const next = jest.fn();
      authController.loginWithGoogleMobile({ body: {} }, mkRes(), next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 when idToken is provided', async () => {
      authService.handleMobileGoogleLogin = jest.fn().mockResolvedValue({
        user: USER,
        token: 'acc',
        refreshToken: 'ref',
      });
      const r = mkRes();
      await authController.loginWithGoogleMobile(
        { body: { idToken: 'google-tok' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('forgotPassword', () => {
    test('returns 400 when email is missing', async () => {
      const next = jest.fn();
      authController.forgotPassword({ body: {} }, mkRes(), next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 even when service throws (silent catch)', async () => {
      authService.generatePasswordReset = jest
        .fn()
        .mockRejectedValue(new Error('no user'));
      const r = mkRes();
      await authController.forgotPassword(
        { body: { email: 'x@y.com' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });

    test('returns 200 when service succeeds', async () => {
      const next = jest.fn();
      authService.generatePasswordReset = jest.fn().mockResolvedValue({});
      const r = mkRes();
      await authController.forgotPassword(
        { body: { email: 'x@y.com' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('resetPassword', () => {
    test('returns 400 when token or newPassword missing', async () => {
      const next = jest.fn();
      authController.resetPassword({ body: { token: 'abc' } }, mkRes(), next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 400 when both missing', async () => {
      const next = jest.fn();
      authController.resetPassword({ body: {} }, mkRes(), next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });

  describe('resendVerification', () => {
    test('returns 400 when email missing', async () => {
      const next = jest.fn();
      await authController.resendVerification({ body: {} }, mkRes(), next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 when service succeeds', async () => {
      authService.resendVerificationEmail = jest
        .fn()
        .mockResolvedValue(undefined);
      const r = mkRes();
      authController.resendVerification(
        { body: { email: 'x@y.com' } },
        r,
        jest.fn()
      );
      await new Promise((resolve) => setImmediate(resolve));
      expect(r.status).toHaveBeenCalledWith(200);
    });

    test('returns 200 even when service fails (catch -> null)', async () => {
      authService.resendVerificationEmail = jest
        .fn()
        .mockRejectedValue(new Error('fail'));
      const r = mkRes();
      authController.resendVerification(
        { body: { email: 'x@y.com' } },
        r,
        jest.fn()
      );
      await new Promise((resolve) => setImmediate(resolve));
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('requestEmailUpdate', () => {
    test('returns 400 when newEmail missing', async () => {
      const next = jest.fn();
      authController.requestEmailUpdate(
        { body: {}, user: USER },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });

  describe('confirmEmailUpdate', () => {
    test('returns 400 when token missing', async () => {
      const next = jest.fn();
      authController.confirmEmailUpdate({ body: {} }, mkRes(), next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 when token provided', async () => {
      authService.confirmEmailUpdate = jest.fn().mockResolvedValue(USER);
      const r = mkRes();
      await authController.confirmEmailUpdate(
        { body: { token: 'tok' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getGoogleAuthUrl', () => {
    test('returns the auth URL', () => {
      authService.getGoogleAuthUrl = jest
        .fn()
        .mockReturnValue('https://accounts.google.com/o/oauth2/auth');
      const r = mkRes();
      authController.getGoogleAuthUrl({}, r);
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('logout', () => {
    test('clears cookies and returns 200', async () => {
      authService.logoutUser = jest.fn().mockResolvedValue(true);
      const r = mkRes();
      await authController.logout({ user: USER }, r, jest.fn());
      expect(r.clearCookie).toHaveBeenCalledWith('accessToken');
      expect(r.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// adminController — uncovered branches
// ═══════════════════════════════════════════════════════════
describe('adminController', () => {
  describe('broadcastToAllUsers', () => {
    test('returns 400 when message is missing', async () => {
      const next = jest.fn();
      await adminController.broadcastToAllUsers(
        { body: {}, user: USER },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 when message is provided', async () => {
      adminService.broadcastMessageToAll = jest.fn().mockResolvedValue(10);
      const r = mkRes();
      await adminController.broadcastToAllUsers(
        { body: { message: 'Hello all' }, user: USER },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('warnUser', () => {
    test('returns 400 when message is missing', async () => {
      const next = jest.fn();
      await adminController.warnUser(
        { params: { id: UID }, body: {}, user: USER },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 when message is provided', async () => {
      adminService.sendUserWarning = jest.fn().mockResolvedValue(undefined);
      const r = mkRes();
      await adminController.warnUser(
        { params: { id: UID }, body: { message: 'Warning!' }, user: USER },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getDashboardStats', () => {
    test('returns 200 with stats', async () => {
      adminService.getPlatformAnalytics = jest
        .fn()
        .mockResolvedValue({ totalUsers: 100 });
      const r = mkRes();
      await adminController.getDashboardStats({ user: USER }, r, jest.fn());
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('suspendUser', () => {
    test('returns 200 with suspended user', async () => {
      adminService.suspendAccount = jest
        .fn()
        .mockResolvedValue({ _id: UID, accountStatus: 'suspended' });
      const r = mkRes();
      await adminController.suspendUser(
        { params: { id: UID }, user: USER },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('hideTrackContent', () => {
    test('returns 200', async () => {
      adminService.hideTrack = jest
        .fn()
        .mockResolvedValue({
          _id: TID,
          isPublic: false,
          moderationStatus: 'hidden',
        });
      const r = mkRes();
      await adminController.hideTrackContent(
        { params: { id: TID }, user: USER },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('submitReport', () => {
    test('returns 201', async () => {
      adminService.createReport = jest.fn().mockResolvedValue({ _id: 'rid' });
      const r = mkRes();
      await adminController.submitReport(
        { body: {}, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(201);
    });
  });

  describe('getReports', () => {
    test('returns 200 with default page/limit', async () => {
      adminService.getPendingReports = jest.fn().mockResolvedValue([]);
      const r = mkRes();
      await adminController.getReports({ query: {} }, r, jest.fn());
      expect(adminService.getPendingReports).toHaveBeenCalledWith(1, 20);
    });

    test('returns 200 with provided page/limit', async () => {
      adminService.getPendingReports = jest.fn().mockResolvedValue([]);
      const r = mkRes();
      await adminController.getReports(
        { query: { page: '2', limit: '5' } },
        r,
        jest.fn()
      );
      expect(adminService.getPendingReports).toHaveBeenCalledWith(2, 5);
    });
  });

  describe('resolveReport', () => {
    test('returns 200', async () => {
      adminService.updateReportStatus = jest
        .fn()
        .mockResolvedValue({ _id: 'rid', status: 'resolved' });
      const r = mkRes();
      await adminController.resolveReport(
        { params: { id: 'rid' }, body: { status: 'resolved' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('restoreUser', () => {
    test('returns 200', async () => {
      adminService.restoreAccount = jest
        .fn()
        .mockResolvedValue({ _id: UID, accountStatus: 'active' });
      const r = mkRes();
      await adminController.restoreUser({ params: { id: UID } }, r, jest.fn());
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('restoreTrackContent', () => {
    test('returns 200', async () => {
      adminService.restoreTrack = jest
        .fn()
        .mockResolvedValue({
          _id: TID,
          isPublic: true,
          moderationStatus: 'approved',
        });
      const r = mkRes();
      await adminController.restoreTrackContent(
        { params: { id: TID } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getAdminTracks', () => {
    test('returns 200', async () => {
      adminService.getAllTracks = jest
        .fn()
        .mockResolvedValue({ tracks: [], total: 0 });
      const r = mkRes();
      await adminController.getAdminTracks({ query: {} }, r, jest.fn());
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getAdminUsers', () => {
    test('returns 200', async () => {
      adminService.getAllUsers = jest
        .fn()
        .mockResolvedValue({ users: [], total: 0 });
      const r = mkRes();
      await adminController.getAdminUsers({ query: {} }, r, jest.fn());
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getDailyActiveUsers', () => {
    test('returns 200', async () => {
      adminService.getDailyActiveUsersSeries = jest.fn().mockResolvedValue([]);
      const r = mkRes();
      await adminController.getDailyActiveUsers(
        { query: { days: '7' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getTopTracks', () => {
    test('returns 200', async () => {
      adminService.getTopTracksList = jest.fn().mockResolvedValue([]);
      const r = mkRes();
      await adminController.getTopTracks(
        { query: { limit: '10' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// messageController — uncovered branches
// ═══════════════════════════════════════════════════════════
describe('messageController', () => {
  describe('sendMessage', () => {
    test('returns 400 when receiverId is missing', async () => {
      const next = jest.fn();
      await messageController.sendMessage(
        { body: { content: 'hi' }, user: { _id: UID } },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 400 when sending to self', async () => {
      const next = jest.fn();
      await messageController.sendMessage(
        { body: { receiverId: UID, content: 'hi' }, user: { _id: UID } },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 400 when no content and no attachmentType', async () => {
      const next = jest.fn();
      await messageController.sendMessage(
        { body: { receiverId: TID }, user: { _id: UID } },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('sends successfully with text content', async () => {
      messageService.sendMessage = jest
        .fn()
        .mockResolvedValue({ _id: 'mid', content: 'hi' });
      const r = mkRes();
      await messageController.sendMessage(
        { body: { receiverId: TID, content: 'hi' }, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(201);
    });

    test('sends with attachment when attachmentType and attachmentId provided', async () => {
      messageService.sendMessage = jest.fn().mockResolvedValue({ _id: 'mid' });
      const r = mkRes();
      await messageController.sendMessage(
        {
          body: {
            receiverId: TID,
            content: 'check this',
            attachmentType: 'Track',
            attachmentId: TID,
          },
          user: { _id: UID },
        },
        r,
        jest.fn()
      );
      expect(messageService.sendMessage).toHaveBeenCalledWith(
        UID,
        TID,
        'check this',
        null,
        { type: 'Track', referenceId: TID }
      );
    });

    test('sends without attachment when only attachmentType with no attachmentId', async () => {
      messageService.sendMessage = jest.fn().mockResolvedValue({ _id: 'mid' });
      const r = mkRes();
      await messageController.sendMessage(
        {
          body: { receiverId: TID, content: 'hi', attachmentType: 'Track' }, // no attachmentId
          user: { _id: UID },
        },
        r,
        jest.fn()
      );
      expect(messageService.sendMessage).toHaveBeenCalledWith(
        UID,
        TID,
        'hi',
        null,
        null
      );
    });
  });

  describe('markAsRead', () => {
    test('returns "already read" message when modifiedCount is 0', async () => {
      messageService.markMessagesAsRead = jest.fn().mockResolvedValue(0);
      const r = mkRes();
      await messageController.markAsRead(
        { params: { conversationId: CID }, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(r.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'All messages were already read.' })
      );
    });

    test('returns modified count message when count > 0', async () => {
      messageService.markMessagesAsRead = jest.fn().mockResolvedValue(5);
      const r = mkRes();
      await messageController.markAsRead(
        { params: { conversationId: CID }, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(r.json).toHaveBeenCalledWith(
        expect.objectContaining({ updatedCount: 5 })
      );
    });
  });

  describe('getUserConversations', () => {
    test('defaults to page=1, limit=20', async () => {
      messageService.getUserConversations = jest
        .fn()
        .mockResolvedValue({ conversations: [], hasMore: false });
      const r = mkRes();
      await messageController.getUserConversations(
        { query: {}, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(messageService.getUserConversations).toHaveBeenCalledWith(
        UID,
        1,
        20
      );
    });
  });

  describe('getConversationMessages', () => {
    test('defaults to page=1, limit=20', async () => {
      messageService.getConversationMessages = jest
        .fn()
        .mockResolvedValue({ messages: [], hasMore: false });
      const r = mkRes();
      await messageController.getConversationMessages(
        { params: { conversationId: CID }, query: {}, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(messageService.getConversationMessages).toHaveBeenCalledWith(
        CID,
        UID,
        1,
        20
      );
    });
  });

  describe('hideConversation', () => {
    test('returns 200', async () => {
      messageService.hideConversation = jest.fn().mockResolvedValue(undefined);
      const r = mkRes();
      await messageController.hideConversation(
        { params: { conversationId: CID }, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('editMessage', () => {
    test('returns 200', async () => {
      messageService.editMessage = jest
        .fn()
        .mockResolvedValue({ _id: 'mid', content: 'edited' });
      const r = mkRes();
      await messageController.editMessage(
        {
          params: { messageId: 'mid' },
          user: { _id: UID },
          body: { content: 'edited' },
        },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('deleteMessageForEveryone', () => {
    test('returns 200', async () => {
      messageService.deleteMessageForEveryone = jest
        .fn()
        .mockResolvedValue({ _id: 'mid' });
      const r = mkRes();
      await messageController.deleteMessageForEveryone(
        { params: { messageId: 'mid' }, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('deleteMessageForMe', () => {
    test('returns 200', async () => {
      messageService.deleteMessageForMe = jest
        .fn()
        .mockResolvedValue(undefined);
      const r = mkRes();
      await messageController.deleteMessageForMe(
        { params: { messageId: 'mid' }, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// notificationController — uncovered branches
// ═══════════════════════════════════════════════════════════
describe('notificationController', () => {
  describe('getNotifications', () => {
    test('returns 400 when userId missing', async () => {
      const next = jest.fn();
      await notificationController.getNotifications(
        { user: {}, query: {} },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('uses req.user.id when available', async () => {
      notificationService.getUserNotifications = jest
        .fn()
        .mockResolvedValue({ notifications: [], pagination: {} });
      const r = mkRes();
      await notificationController.getNotifications(
        { user: { id: UID }, query: { page: '2', limit: '5' } },
        r,
        jest.fn()
      );
      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        UID,
        2,
        5
      );
    });

    test('uses req.user._id when id not available', async () => {
      notificationService.getUserNotifications = jest
        .fn()
        .mockResolvedValue({ notifications: [], pagination: {} });
      const r = mkRes();
      await notificationController.getNotifications(
        { user: { _id: UID }, query: {} },
        r,
        jest.fn()
      );
      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        UID,
        1,
        20
      );
    });
  });

  describe('getUnreadCount', () => {
    test('returns 400 when userId missing', async () => {
      const next = jest.fn();
      await notificationController.getUnreadCount(
        { user: {}, query: {} },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns unread count', async () => {
      notificationService.getUnreadCount = jest.fn().mockResolvedValue(3);
      const r = mkRes();
      await notificationController.getUnreadCount(
        { user: { id: UID }, query: {} },
        r,
        jest.fn()
      );
      expect(r.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { unreadCount: 3 } })
      );
    });
  });

  describe('markAllAsRead', () => {
    test('returns 400 when userId missing', async () => {
      const next = jest.fn();
      await notificationController.markAllAsRead({ user: {} }, mkRes(), next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns modifiedCount', async () => {
      notificationService.markAllAsRead = jest.fn().mockResolvedValue(5);
      const r = mkRes();
      await notificationController.markAllAsRead(
        { user: { id: UID } },
        r,
        jest.fn()
      );
      expect(r.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { modifiedCount: 5 } })
      );
    });
  });

  describe('markOneAsRead', () => {
    test('returns 404 when notification not found', async () => {
      notificationService.markOneAsRead = jest.fn().mockResolvedValue(null);
      const next = jest.fn();
      await notificationController.markOneAsRead(
        { user: { id: UID }, params: { id: 'nid' } },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    test('returns 200 when notification found', async () => {
      notificationService.markOneAsRead = jest
        .fn()
        .mockResolvedValue({ _id: 'nid', isRead: true });
      const r = mkRes();
      await notificationController.markOneAsRead(
        { user: { id: UID }, params: { id: 'nid' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('deleteNotification', () => {
    test('returns 404 when notification not found', async () => {
      notificationService.deleteNotification = jest
        .fn()
        .mockResolvedValue(null);
      const next = jest.fn();
      await notificationController.deleteNotification(
        { user: { id: UID }, params: { id: 'nid' } },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    test('returns 200 when notification deleted', async () => {
      notificationService.deleteNotification = jest
        .fn()
        .mockResolvedValue({ _id: 'nid' });
      const r = mkRes();
      await notificationController.deleteNotification(
        { user: { id: UID }, params: { id: 'nid' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('registerFcmToken', () => {
    test('returns 400 when token missing', async () => {
      const next = jest.fn();
      await notificationController.registerFcmToken(
        { user: { id: UID }, body: {} },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 when token provided', async () => {
      notificationService.addFcmToken = jest.fn().mockResolvedValue(undefined);
      const r = mkRes();
      await notificationController.registerFcmToken(
        { user: { id: UID }, body: { token: 'fcm-tok' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('removeFcmToken', () => {
    test('returns 400 when token missing', async () => {
      const next = jest.fn();
      await notificationController.removeFcmToken(
        { user: { id: UID }, body: {} },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 when token provided', async () => {
      notificationService.removeFcmToken = jest
        .fn()
        .mockResolvedValue(undefined);
      const r = mkRes();
      await notificationController.removeFcmToken(
        { user: { id: UID }, body: { token: 'fcm-tok' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getPreferences', () => {
    test('returns 400 when userId missing', async () => {
      const next = jest.fn();
      await notificationController.getPreferences({ user: {} }, mkRes(), next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 with settings', async () => {
      notificationService.getPreferences = jest
        .fn()
        .mockResolvedValue({ likes: true });
      const r = mkRes();
      await notificationController.getPreferences(
        { user: { id: UID } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('updatePreferences', () => {
    test('returns 400 when userId missing', async () => {
      const next = jest.fn();
      await notificationController.updatePreferences(
        { user: {}, body: {} },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 with updated settings', async () => {
      notificationService.updatePreferences = jest
        .fn()
        .mockResolvedValue({ likes: false });
      const r = mkRes();
      await notificationController.updatePreferences(
        { user: { id: UID }, body: { likes: false } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// stationController — uncovered branches
// ═══════════════════════════════════════════════════════════
describe('stationController', () => {
  describe('likeStation', () => {
    test('returns 400 when userId missing', async () => {
      const next = jest.fn();
      await stationController.likeStation(
        {
          user: {},
          params: { stationId: 'sid' },
          body: { stationType: 'genre' },
        },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 201 when successful', async () => {
      stationService.likeStation = jest.fn().mockResolvedValue({ _id: 'slid' });
      const r = mkRes();
      await stationController.likeStation(
        {
          user: { _id: UID, id: UID },
          params: { stationId: 'sid' },
          body: { stationType: 'genre', genre: 'Pop' },
        },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(201);
    });
  });

  describe('unlikeStation', () => {
    test('returns 400 when userId missing', async () => {
      const next = jest.fn();
      await stationController.unlikeStation(
        { user: {}, params: { stationId: 'sid' } },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 when successful', async () => {
      stationService.unlikeStation = jest
        .fn()
        .mockResolvedValue({ deleted: true });
      const r = mkRes();
      await stationController.unlikeStation(
        { user: { _id: UID }, params: { stationId: 'sid' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getLikedStations', () => {
    test('returns 400 when userId missing', async () => {
      const next = jest.fn();
      await stationController.getLikedStations(
        { user: {}, query: {} },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 with hydrate=true by default', async () => {
      stationService.getLikedStations = jest
        .fn()
        .mockResolvedValue({ stations: [], total: 0 });
      const r = mkRes();
      await stationController.getLikedStations(
        { user: { _id: UID }, query: {} },
        r,
        jest.fn()
      );
      expect(stationService.getLikedStations).toHaveBeenCalledWith(
        UID,
        1,
        20,
        true
      );
    });

    test('passes hydrate=false when query says false', async () => {
      stationService.getLikedStations = jest
        .fn()
        .mockResolvedValue({ stations: [], total: 0 });
      const r = mkRes();
      await stationController.getLikedStations(
        { user: { _id: UID }, query: { hydrate: 'false' } },
        r,
        jest.fn()
      );
      expect(stationService.getLikedStations).toHaveBeenCalledWith(
        UID,
        1,
        20,
        false
      );
    });
  });

  describe('checkStationLiked', () => {
    test('returns 400 when userId missing', async () => {
      const next = jest.fn();
      await stationController.checkStationLiked(
        { user: {}, params: { stationId: 'sid' } },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 with liked status', async () => {
      stationService.checkStationLiked = jest
        .fn()
        .mockResolvedValue({ liked: true });
      const r = mkRes();
      await stationController.checkStationLiked(
        { user: { _id: UID }, params: { stationId: 'sid' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// searchController — uncovered branches
// ═══════════════════════════════════════════════════════════
describe('searchController', () => {
  describe('autocomplete', () => {
    test('returns 400 when q is missing', async () => {
      const r = mkRes();
      await searchController.autocomplete({ query: {} }, r, jest.fn());
      expect(r.status).toHaveBeenCalledWith(400);
    });

    test('returns results when q provided', async () => {
      searchService.autocompleteSearch = jest
        .fn()
        .mockResolvedValue({ tracks: [] });
      const r = mkRes();
      await searchController.autocomplete(
        { query: { q: 'test' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('globalSearch', () => {
    test('returns 400 when q is missing', async () => {
      const r = mkRes();
      await searchController.globalSearch(
        { query: {}, user: null },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(400);
    });

    test('returns results when q provided without auth', async () => {
      searchService.performGlobalSearch = jest.fn().mockResolvedValue({
        tracks: [{ _id: TID }],
        users: [],
        playlists: [],
      });
      const r = mkRes();
      await searchController.globalSearch(
        {
          query: { q: 'beat', type: 'Track', limit: '5', page: '1' },
          user: null,
        },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
      expect(searchService.performGlobalSearch).toHaveBeenCalledWith(
        'beat',
        'Track',
        5,
        0,
        null,
        { licenseType: undefined }
      );
    });

    test('passes currentUserId when authenticated', async () => {
      searchService.performGlobalSearch = jest
        .fn()
        .mockResolvedValue({ tracks: [], users: [], playlists: [] });
      const r = mkRes();
      await searchController.globalSearch(
        { query: { q: 'test' }, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(searchService.performGlobalSearch).toHaveBeenCalledWith(
        'test',
        undefined,
        10,
        0,
        UID,
        { licenseType: undefined }
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════
// profileController — uncovered branches
// ═══════════════════════════════════════════════════════════
describe('profileController', () => {
  describe('updatePrivacy', () => {
    test('returns 400 when userId missing', async () => {
      const next = jest.fn();
      await profileController.updatePrivacy(
        { user: {}, body: {} },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 with updated user', async () => {
      profileService.updatePrivacy = jest
        .fn()
        .mockResolvedValue({ isPrivate: true });
      const r = mkRes();
      await profileController.updatePrivacy(
        { user: { id: UID }, body: { isPrivate: true } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('updateSocialLinks', () => {
    test('returns 400 when userId missing', async () => {
      const next = jest.fn();
      await profileController.updateSocialLinks(
        { user: {}, body: {} },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 with updated links', async () => {
      profileService.updateSocialLinks = jest
        .fn()
        .mockResolvedValue({ socialLinks: [] });
      const r = mkRes();
      await profileController.updateSocialLinks(
        { user: { id: UID }, body: { socialLinks: [] } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('updateTier', () => {
    test('returns 400 when userId missing', async () => {
      const next = jest.fn();
      await profileController.updateTier({ user: {}, body: {} }, mkRes(), next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 with updated role', async () => {
      profileService.updateTier = jest
        .fn()
        .mockResolvedValue({ role: 'Artist' });
      const r = mkRes();
      await profileController.updateTier(
        { user: { id: UID }, body: { role: 'Artist' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('removeSocialLink', () => {
    test('returns 400 when userId missing', async () => {
      const next = jest.fn();
      await profileController.removeSocialLink(
        { user: {}, params: { linkId: 'lid' } },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });

  describe('uploadProfileImages', () => {
    test('returns 400 when no files provided', async () => {
      const next = jest.fn();
      await profileController.uploadProfileImages(
        { files: {}, user: { id: UID } },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 400 when files is null', async () => {
      const next = jest.fn();
      await profileController.uploadProfileImages(
        { files: null, user: { id: UID } },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 400 when userId missing after file check', async () => {
      const next = jest.fn();
      await profileController.uploadProfileImages(
        { files: { avatar: [{}] }, user: {} },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 with updated images', async () => {
      profileService.updateProfileImages = jest
        .fn()
        .mockResolvedValue({ avatarUrl: 'a.png', coverUrl: 'c.png' });
      const r = mkRes();
      await profileController.uploadProfileImages(
        { files: { avatar: [{}] }, user: { id: UID, _id: UID } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('updateProfile', () => {
    test('returns 400 when userId missing', async () => {
      const next = jest.fn();
      await profileController.updateProfile(
        { user: {}, body: {} },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });

  describe('getProfileByPermalink', () => {
    test('returns 200', async () => {
      profileService.getProfileByPermalink = jest.fn().mockResolvedValue(USER);
      const r = mkRes();
      await profileController.getProfileByPermalink(
        { params: { permalink: 'test' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// playlistController — uncovered branches
// ═══════════════════════════════════════════════════════════
describe('playlistController', () => {
  describe('uploadArtwork', () => {
    test('returns 400 when no file provided', async () => {
      const next = jest.fn();
      await playlistController.uploadArtwork(
        { file: null, params: { id: 'pid' }, user: { _id: UID } },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 when file provided', async () => {
      playlistService.uploadArtwork = jest
        .fn()
        .mockResolvedValue({ _id: 'pid' });
      const r = mkRes();
      await playlistController.uploadArtwork(
        {
          file: { buffer: Buffer.from('img') },
          params: { id: 'pid' },
          user: { _id: UID },
        },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getPlaylist', () => {
    test('passes user=null when not authenticated', async () => {
      playlistService.getPlaylist = jest.fn().mockResolvedValue({ _id: 'pid' });
      const r = mkRes();
      await playlistController.getPlaylist(
        { params: { id: 'pid' }, query: {}, user: undefined },
        r,
        jest.fn()
      );
      expect(playlistService.getPlaylist).toHaveBeenCalledWith(
        'pid',
        null,
        undefined
      );
    });

    test('passes user when authenticated', async () => {
      playlistService.getPlaylist = jest.fn().mockResolvedValue({ _id: 'pid' });
      const r = mkRes();
      await playlistController.getPlaylist(
        { params: { id: 'pid' }, query: { secretToken: 'tok' }, user: USER },
        r,
        jest.fn()
      );
      expect(playlistService.getPlaylist).toHaveBeenCalledWith(
        'pid',
        USER,
        'tok'
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════
// trackController — uncovered branches
// ═══════════════════════════════════════════════════════════
describe('trackController', () => {
  describe('updateVisibility', () => {
    test('returns 400 when isPublic is not boolean', async () => {
      const next = jest.fn();
      await trackController.updateVisibility(
        {
          params: { id: TID },
          user: { _id: UID, id: UID },
          body: { isPublic: 'true' },
        },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 400 when isPublic is missing', async () => {
      const next = jest.fn();
      await trackController.updateVisibility(
        { params: { id: TID }, user: { _id: UID }, body: {} },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 when isPublic is boolean true', async () => {
      trackService.toggleTrackVisibility = jest
        .fn()
        .mockResolvedValue({ _id: TID, isPublic: true });
      const r = mkRes();
      await trackController.updateVisibility(
        { params: { id: TID }, user: { _id: UID }, body: { isPublic: true } },
        r,
        jest.fn()
      );
      expect(r.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Track is now Public' })
      );
    });

    test('returns 200 when isPublic is boolean false', async () => {
      trackService.toggleTrackVisibility = jest
        .fn()
        .mockResolvedValue({ _id: TID, isPublic: false });
      const r = mkRes();
      await trackController.updateVisibility(
        { params: { id: TID }, user: { _id: UID }, body: { isPublic: false } },
        r,
        jest.fn()
      );
      expect(r.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Track is now Private' })
      );
    });
  });

  describe('uploadArtwork', () => {
    test('returns 400 when no file provided', async () => {
      const next = jest.fn();
      await trackController.uploadArtwork(
        { params: { id: TID }, user: { _id: UID }, file: null },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 200 when file provided', async () => {
      trackService.updateTrackArtwork = jest
        .fn()
        .mockResolvedValue({ _id: TID, artworkUrl: 'art.png' });
      const r = mkRes();
      await trackController.uploadArtwork(
        {
          params: { id: TID },
          user: { _id: UID },
          file: { buffer: Buffer.from('img'), originalname: 'art.png' },
        },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getTrack', () => {
    test('passes userId=null when no user', async () => {
      trackService.getTrackByPermalink = jest
        .fn()
        .mockResolvedValue({ _id: TID });
      const r = mkRes();
      await trackController.getTrack(
        { params: { permalink: 'beat' }, user: null },
        r,
        jest.fn()
      );
      expect(trackService.getTrackByPermalink).toHaveBeenCalledWith(
        'beat',
        null
      );
    });

    test('passes userId when user authenticated', async () => {
      trackService.getTrackByPermalink = jest
        .fn()
        .mockResolvedValue({ _id: TID });
      const r = mkRes();
      await trackController.getTrack(
        { params: { permalink: 'beat' }, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(trackService.getTrackByPermalink).toHaveBeenCalledWith(
        'beat',
        UID
      );
    });
  });

  describe('downloadTrack', () => {
    test('sets content-length when provided', async () => {
      const fakeStream = { pipe: jest.fn() };
      trackService.downloadTrackAudio = jest.fn().mockResolvedValue({
        stream: fakeStream,
        contentLength: 1234,
        filename: 'beat.mp3',
      });
      const r = mkRes();
      await trackController.downloadTrack(
        { params: { id: TID }, user: USER },
        r,
        jest.fn()
      );
      expect(r.setHeader).toHaveBeenCalledWith('Content-Length', 1234);
      expect(fakeStream.pipe).toHaveBeenCalledWith(r);
    });

    test('skips content-length when null', async () => {
      const fakeStream = { pipe: jest.fn() };
      trackService.downloadTrackAudio = jest.fn().mockResolvedValue({
        stream: fakeStream,
        contentLength: null,
        filename: 'beat.mp3',
      });
      const r = mkRes();
      await trackController.downloadTrack(
        { params: { id: TID }, user: USER },
        r,
        jest.fn()
      );
      expect(r.setHeader).not.toHaveBeenCalledWith(
        'Content-Length',
        expect.anything()
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════
// discoveryController — coverage
// ═══════════════════════════════════════════════════════════
describe('discoveryController', () => {
  test('getTrendingCharts returns 200 with default limit', async () => {
    discoveryService.getTrendingTracks = jest
      .fn()
      .mockResolvedValue([{ title: 'Track' }]);
    const r = mkRes();
    await discoveryController.getTrendingCharts({ query: {} }, r, jest.fn());
    expect(discoveryService.getTrendingTracks).toHaveBeenCalledWith(
      20,
      undefined
    );
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ results: 1 })
    );
  });

  test('getTrendingCharts handles null result', async () => {
    discoveryService.getTrendingTracks = jest.fn().mockResolvedValue(null);
    const r = mkRes();
    await discoveryController.getTrendingCharts(
      { query: { limit: '10', genre: 'Pop' } },
      r,
      jest.fn()
    );
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ results: 0 })
    );
  });

  test('getStationBasedOnLikes returns 200', async () => {
    discoveryService.getRecommendedBasedOnLikes = jest
      .fn()
      .mockResolvedValue([]);
    const r = mkRes();
    await discoveryController.getStationBasedOnLikes(
      { user: { _id: UID } },
      r,
      jest.fn()
    );
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getStationByGenre returns 200', async () => {
    discoveryService.getStationByGenre = jest.fn().mockResolvedValue([]);
    const r = mkRes();
    await discoveryController.getStationByGenre(
      { params: { genre: 'Pop' } },
      r,
      jest.fn()
    );
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getStationByArtist returns 200', async () => {
    discoveryService.getStationByArtist = jest.fn().mockResolvedValue([]);
    const r = mkRes();
    await discoveryController.getStationByArtist(
      { params: { artistId: UID } },
      r,
      jest.fn()
    );
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getRelatedTracks returns 200', async () => {
    discoveryService.getRelatedTracks = jest.fn().mockResolvedValue([]);
    const r = mkRes();
    await discoveryController.getRelatedTracks(
      { params: { trackId: TID } },
      r,
      jest.fn()
    );
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getUsersWhoLikedAlsoLiked returns 200', async () => {
    discoveryService.getUsersWhoLikedAlsoLiked = jest
      .fn()
      .mockResolvedValue([]);
    const r = mkRes();
    await discoveryController.getUsersWhoLikedAlsoLiked(
      { params: { trackId: TID } },
      r,
      jest.fn()
    );
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getMoreOfWhatYouLike returns 200', async () => {
    discoveryService.getMoreOfWhatYouLike = jest
      .fn()
      .mockResolvedValue({ tracks: [], basedOn: 'likes', genres: [] });
    const r = mkRes();
    await discoveryController.getMoreOfWhatYouLike(
      { user: { _id: UID } },
      r,
      jest.fn()
    );
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getMixedForYou returns 200', async () => {
    discoveryService.getMixedForYou = jest.fn().mockResolvedValue([]);
    const r = mkRes();
    await discoveryController.getMixedForYou(
      { user: { _id: UID } },
      r,
      jest.fn()
    );
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getCuratedByPlatform returns 200', async () => {
    discoveryService.getCuratedByPlatform = jest.fn().mockResolvedValue([]);
    const r = mkRes();
    await discoveryController.getCuratedByPlatform({}, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });
});

// ═══════════════════════════════════════════════════════════
// historyController — uncovered branches
// ═══════════════════════════════════════════════════════════
describe('historyController', () => {
  describe('updateProgress', () => {
    test('returns 400 when trackId missing', async () => {
      const next = jest.fn();
      await historyController.updateProgress(
        { body: { progress: 30 }, user: { _id: UID } },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('returns 400 when progress missing', async () => {
      const next = jest.fn();
      await historyController.updateProgress(
        { body: { trackId: TID }, user: { _id: UID } },
        mkRes(),
        next
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('passes playlistId=null when not provided', async () => {
      playbackService.recordPlaybackProgress = jest
        .fn()
        .mockResolvedValue({ _id: 'hid' });
      const r = mkRes();
      await historyController.updateProgress(
        { body: { trackId: TID, progress: 30 }, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(playbackService.recordPlaybackProgress).toHaveBeenCalledWith(
        UID,
        TID,
        30,
        null
      );
    });

    test('passes playlistId when provided', async () => {
      playbackService.recordPlaybackProgress = jest
        .fn()
        .mockResolvedValue({ _id: 'hid' });
      const r = mkRes();
      await historyController.updateProgress(
        {
          body: { trackId: TID, progress: 30, playlistId: 'pid' },
          user: { _id: UID },
        },
        r,
        jest.fn()
      );
      expect(playbackService.recordPlaybackProgress).toHaveBeenCalledWith(
        UID,
        TID,
        30,
        'pid'
      );
    });
  });

  describe('getRecentlyPlayed', () => {
    test('defaults to page=1 limit=20', async () => {
      playbackService.getRecentlyPlayed = jest.fn().mockResolvedValue([]);
      const r = mkRes();
      await historyController.getRecentlyPlayed(
        { query: {}, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(playbackService.getRecentlyPlayed).toHaveBeenCalledWith(
        UID,
        1,
        20
      );
    });
  });

  describe('getRecentlyPlayedPlaylists', () => {
    test('returns 200', async () => {
      playbackService.getRecentlyPlayedPlaylists = jest
        .fn()
        .mockResolvedValue([]);
      const r = mkRes();
      await historyController.getRecentlyPlayedPlaylists(
        { query: {}, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getRecentlyPlayedMixed', () => {
    test('defaults to limit=10', async () => {
      playbackService.getRecentlyPlayedMixed = jest.fn().mockResolvedValue([]);
      const r = mkRes();
      await historyController.getRecentlyPlayedMixed(
        { query: {}, user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(playbackService.getRecentlyPlayedMixed).toHaveBeenCalledWith(
        UID,
        10
      );
    });
  });

  describe('clearHistory', () => {
    test('returns 200', async () => {
      playbackService.clearListeningHistory = jest
        .fn()
        .mockResolvedValue(undefined);
      const r = mkRes();
      await historyController.clearHistory(
        { user: { _id: UID } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// subscriptionController — all branches
// ═══════════════════════════════════════════════════════════
describe('subscriptionController', () => {
  describe('subscribe', () => {
    test('returns 200 with checkout URL', async () => {
      subscriptionService.createStripeCheckout = jest.fn().mockResolvedValue({
        success: true,
        checkoutUrl: 'https://checkout.stripe.com/pay/sess_123',
      });
      const r = mkRes();
      await subscriptionController.subscribe(
        {
          body: { planType: 'Pro' },
          user: { ...USER, role: 'Artist', isPremium: false },
        },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('cancel', () => {
    test('returns 200', async () => {
      subscriptionService.cancelSubscription = jest.fn().mockResolvedValue({
        message: 'Cancelled',
        expiresAt: new Date(),
      });
      const r = mkRes();
      await subscriptionController.cancel(
        { user: { id: UID, isPremium: true } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });

  describe('stripeWebhook', () => {
    test('returns 200 on webhook', async () => {
      subscriptionService.handleWebhook = jest
        .fn()
        .mockResolvedValue(undefined);
      const r = mkRes();
      await subscriptionController.stripeWebhook(
        { body: Buffer.from('raw'), headers: { 'stripe-signature': 'sig' } },
        r,
        jest.fn()
      );
      expect(r.status).toHaveBeenCalledWith(200);
    });
  });
});
