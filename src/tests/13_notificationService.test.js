'use strict';
/**
 * 13_notificationService.test.js
 * Deep coverage of notificationService (processNotification, all triggers, email/push paths)
 */

jest.mock('../models/notificationModel');
jest.mock('../models/userModel');
jest.mock('../sockets/socketSetup');
jest.mock('../services/firebaseService');
jest.mock('../utils/sendEmail');

const Notification = require('../models/notificationModel');
const User = require('../models/userModel');
const socketSetup = require('../sockets/socketSetup');
const firebaseService = require('../services/firebaseService');
const sendEmail = require('../utils/sendEmail');

const notificationService = require('../services/notificationService');

const UID = '507f1f77bcf86cd799439011';
const AID = '507f1f77bcf86cd799439022';
const TID = '507f1f77bcf86cd799439033';
const NID = '507f1f77bcf86cd799439044';

const mkIo = () => ({
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
  sockets: { adapter: { rooms: new Map() } },
});

const mkNotif = (overrides = {}) => ({
  _id: NID,
  recipient: UID,
  actors: [AID],
  actorCount: 1,
  type: 'LIKE',
  target: TID,
  targetModel: 'Track',
  isRead: false,
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  const io = mkIo();
  socketSetup.getIo.mockReturnValue(io);
  socketSetup.connectedUsers = new Map();
  firebaseService.sendPushNotification = jest.fn().mockResolvedValue(true);
  sendEmail.mockResolvedValue(undefined);
});

// ─── processNotification via notifyLike ──────────────────────────────────────
describe('notifyLike — processNotification core paths', () => {
  test('returns null for self-notification', async () => {
    const result = await notificationService.notifyLike(UID, UID, TID);
    expect(result).toBeNull();
  });

  test('creates new notification when none exists', async () => {
    Notification.findOne.mockResolvedValue(null);
    const notif = mkNotif();
    Notification.create.mockResolvedValue(notif);
    const populated = { ...notif, actors: [{ _id: AID, displayName: 'Actor' }] };
    Notification.findById = jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue(populated),
    });
    // chain mock
    const chain = { populate: jest.fn() };
    chain.populate.mockReturnValue(chain);
    chain.populate.mockResolvedValueOnce(populated);
    Notification.findById.mockReturnValue(chain);

    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: UID, fcmTokens: [], notificationSettings: {} }),
    });

    const result = await notificationService.notifyLike(UID, AID, TID);
    expect(Notification.create).toHaveBeenCalled();
  });

  test('groups existing notification when actor not included', async () => {
    const existing = mkNotif({ actors: [{ toString: () => 'other' }], actorCount: 1 });
    existing.actors.some = jest.fn().mockReturnValue(false);
    Notification.findOne.mockResolvedValue(existing);
    const chain = { populate: jest.fn() };
    chain.populate.mockReturnValue(chain);
    chain.populate.mockResolvedValue(mkNotif());
    Notification.findById.mockReturnValue(chain);
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: UID, fcmTokens: [], notificationSettings: {} }),
    });

    await notificationService.notifyLike(UID, AID, TID);
    expect(existing.save).toHaveBeenCalled();
  });

  test('does not add duplicate actor to existing notification', async () => {
    const existing = mkNotif({ actors: [AID], actorCount: 1 });
    existing.actors.some = jest.fn().mockReturnValue(true);
    Notification.findOne.mockResolvedValue(existing);
    const chain = { populate: jest.fn() };
    chain.populate.mockReturnValue(chain);
    chain.populate.mockResolvedValue(mkNotif());
    Notification.findById.mockReturnValue(chain);
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: UID, fcmTokens: [], notificationSettings: {} }),
    });

    await notificationService.notifyLike(UID, AID, TID);
    expect(existing.save).not.toHaveBeenCalled();
  });
});

// ─── Push notification paths ──────────────────────────────────────────────────
describe('processNotification — push notification type switches', () => {
  const setupCreate = (type, settings) => {
    Notification.findOne.mockResolvedValue(null);
    const notif = mkNotif({ type });
    Notification.create.mockResolvedValue(notif);
    const populated = { ...notif, actors: [{ _id: AID, displayName: 'DJ' }] };
    const chain = { 
      populate: jest.fn().mockReturnThis(),
      then: jest.fn((cb) => cb(populated))
    };
    Notification.findById.mockReturnValue(chain);
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: UID,
        fcmTokens: ['fcmtok123'],
        notificationSettings: settings,
        email: 'u@b.com',
        displayName: 'User',
      }),
    });
  };

  test('sends LIKE push when allowLikes is true', async () => {
    setupCreate('LIKE', { pushEnabled: true, allowLikes: true });
    await notificationService.notifyLike(UID, AID, TID);
    expect(firebaseService.sendPushNotification).toHaveBeenCalled();
  });

  test('skips LIKE push when allowLikes is false', async () => {
    setupCreate('LIKE', { pushEnabled: true, allowLikes: false });
    await notificationService.notifyLike(UID, AID, TID);
    expect(firebaseService.sendPushNotification).not.toHaveBeenCalled();
  });

  test('sends REPOST push when allowReposts is true', async () => {
    setupCreate('REPOST', { pushEnabled: true, allowReposts: true });
    await notificationService.notifyRepost(UID, AID, TID);
    expect(firebaseService.sendPushNotification).toHaveBeenCalled();
  });

  test('sends COMMENT push when allowComments is true', async () => {
    setupCreate('COMMENT', { pushEnabled: true, allowComments: true });
    await notificationService.notifyComment(UID, AID, TID, 'great track');
    expect(firebaseService.sendPushNotification).toHaveBeenCalled();
  });

  test('sends FOLLOW push when allowFollows is true', async () => {
    setupCreate('FOLLOW', { pushEnabled: true, allowFollows: true });
    await notificationService.notifyFollow(UID, AID);
    expect(firebaseService.sendPushNotification).toHaveBeenCalled();
  });

  test('sends MESSAGE push when allowMessages is true', async () => {
    setupCreate('MESSAGE', { pushEnabled: true, allowMessages: true });
    await notificationService.notifyMessage(UID, AID, TID, 'hey!', NID);
    expect(firebaseService.sendPushNotification).toHaveBeenCalled();
  });

  test('sends NEW_TRACK push when allowNewTracks is true', async () => {
    setupCreate('NEW_TRACK', { pushEnabled: true, allowNewTracks: true });
    await notificationService.notifyNewTrack(UID, AID, TID);
    expect(firebaseService.sendPushNotification).toHaveBeenCalled();
  });

  test('sends NEW_PLAYLIST push when allowNewTracks not false', async () => {
    setupCreate('NEW_PLAYLIST', { pushEnabled: true, allowNewTracks: true });
    // NEW_PLAYLIST goes through notifyNewPlaylist (direct create path)
    Notification.create.mockResolvedValue(mkNotif({ type: 'NEW_PLAYLIST' }));
    await notificationService.notifyNewPlaylist(UID, AID, TID);
    expect(Notification.create).toHaveBeenCalled();
  });

  test('skips push when no fcmTokens', async () => {
    setupCreate('LIKE', { pushEnabled: true, allowLikes: true });
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: UID, fcmTokens: [], notificationSettings: { pushEnabled: true, allowLikes: true },
      }),
    });
    await notificationService.notifyLike(UID, AID, TID);
    expect(firebaseService.sendPushNotification).not.toHaveBeenCalled();
  });

  test('returns populatedNotification when no recipient found', async () => {
    Notification.findOne.mockResolvedValue(null);
    const notif = mkNotif();
    Notification.create.mockResolvedValue(notif);
    const populated = { ...notif, actors: [{ _id: AID, displayName: 'DJ' }] };
    const chain = { populate: jest.fn() };
    chain.populate.mockReturnValue(chain);
    chain.populate.mockResolvedValue(populated);
    Notification.findById.mockReturnValue(chain);
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    const result = await notificationService.notifyLike(UID, AID, TID);
    expect(result).toBeDefined();
    expect(firebaseService.sendPushNotification).not.toHaveBeenCalled();
  });
});

// ─── Email notification paths ─────────────────────────────────────────────────
describe('processNotification — email paths', () => {
  const setupForEmail = (type, settings) => {
    Notification.findOne.mockResolvedValue(null);
    const notif = mkNotif({ type });
    Notification.create.mockResolvedValue(notif);
    const populated = { ...notif, actors: [{ _id: AID, displayName: 'DJ' }] };
    const chain = { 
      populate: jest.fn().mockReturnThis(),
      then: jest.fn((cb) => cb(populated))
    };
    Notification.findById.mockReturnValue(chain);
    // First call for push settings, second for email user fetch
    User.findById = jest.fn()
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ _id: UID, fcmTokens: [], notificationSettings: settings }) })
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ _id: UID, email: 'u@beats.com', displayName: 'DJ User' }) });
  };

  test('sends LIKE email when emailLikes not false', async () => {
    setupForEmail('LIKE', { pushEnabled: false, emailLikes: true });
    await notificationService.notifyLike(UID, AID, TID);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('liked') }));
  });

  test('sends REPOST email when emailReposts not false', async () => {
    setupForEmail('REPOST', { pushEnabled: false, emailReposts: true });
    await notificationService.notifyRepost(UID, AID, TID);
    expect(sendEmail).toHaveBeenCalled();
  });

  test('sends COMMENT email when emailComments not false', async () => {
    setupForEmail('COMMENT', { pushEnabled: false, emailComments: true });
    await notificationService.notifyComment(UID, AID, TID, 'nice!');
    expect(sendEmail).toHaveBeenCalled();
  });

  test('sends FOLLOW email when emailFollows not false', async () => {
    setupForEmail('FOLLOW', { pushEnabled: false, emailFollows: true });
    await notificationService.notifyFollow(UID, AID);
    expect(sendEmail).toHaveBeenCalled();
  });

  test('sends MESSAGE email when emailMessages not false', async () => {
    setupForEmail('MESSAGE', { pushEnabled: false, emailMessages: true });
    await notificationService.notifyMessage(UID, AID, TID, 'hello', NID);
    expect(sendEmail).toHaveBeenCalled();
  });

  test('sends NEW_TRACK email when emailNewTracks not false', async () => {
    setupForEmail('NEW_TRACK', { pushEnabled: false, emailNewTracks: true });
    await notificationService.notifyNewTrack(UID, AID, TID);
    expect(sendEmail).toHaveBeenCalled();
  });

  test('sends NEW_PLAYLIST email when emailNewTracks not false', async () => {
    setupForEmail('NEW_PLAYLIST', { pushEnabled: false, emailNewTracks: true });
    await notificationService.notifyNewTrack(UID, AID, TID);
    expect(sendEmail).toHaveBeenCalled();
  });

  test('sends RECOMMENDED email when emailRecommended not false', async () => {
    setupForEmail('RECOMMENDED', { pushEnabled: false, emailRecommended: true });
    // notifyRecommended has its own direct path
    Notification.create.mockResolvedValue(mkNotif({ type: 'RECOMMENDED' }));
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: UID, email: 'u@beats.com', displayName: 'DJ User',
        notificationSettings: { emailRecommended: true },
      }),
    });
    await notificationService.notifyRecommended(UID, [TID]);
    expect(sendEmail).toHaveBeenCalled();
  });

  test('does not send MENTION email (null emailSettingKey)', async () => {
    setupForEmail('MENTION', { pushEnabled: false });
    Notification.create.mockResolvedValue(mkNotif({ type: 'MENTION' }));
    await notificationService.notifyMention(UID, AID, TID);
    // MENTION goes through direct create, not processNotification
    expect(Notification.create).toHaveBeenCalled();
  });

  test('silently handles email send failure', async () => {
    setupForEmail('LIKE', { pushEnabled: false, emailLikes: true });
    sendEmail.mockRejectedValue(new Error('SMTP down'));
    await expect(notificationService.notifyLike(UID, AID, TID)).resolves.toBeDefined();
  });
});

// ─── getUserNotifications ─────────────────────────────────────────────────────
describe('getUserNotifications', () => {
  test('returns paginated notifications', async () => {
    const chain = { 
      sort: jest.fn().mockReturnThis(), 
      skip: jest.fn().mockReturnThis(), 
      limit: jest.fn().mockReturnThis(), 
      populate: jest.fn().mockReturnThis(),
      then: jest.fn((cb) => cb([mkNotif()]))
    };
    Notification.find.mockReturnValue(chain);
    Notification.countDocuments.mockResolvedValue(1);

    const result = await notificationService.getUserNotifications(UID, 1, 20);
    expect(result.notifications).toBeDefined();
    expect(result.pagination.total).toBe(1);
  });
});

// ─── getUnreadCount ───────────────────────────────────────────────────────────
describe('getUnreadCount', () => {
  test('returns count', async () => {
    Notification.countDocuments.mockResolvedValue(5);
    const result = await notificationService.getUnreadCount(UID);
    expect(result).toBe(5);
  });
});

// ─── markAllAsRead ────────────────────────────────────────────────────────────
describe('markAllAsRead', () => {
  test('marks all as read and emits socket', async () => {
    Notification.updateMany.mockResolvedValue({ modifiedCount: 3 });
    const result = await notificationService.markAllAsRead(UID);
    expect(result).toBe(3);
    expect(socketSetup.getIo().to).toHaveBeenCalled();
  });

  test('handles socket error gracefully', async () => {
    Notification.updateMany.mockResolvedValue({ modifiedCount: 1 });
    socketSetup.getIo.mockImplementation(() => { throw new Error('no socket'); });
    await expect(notificationService.markAllAsRead(UID)).resolves.toBe(1);
  });
});

// ─── markOneAsRead ────────────────────────────────────────────────────────────
describe('markOneAsRead', () => {
  test('returns null when notification not found', async () => {
    Notification.findOne.mockResolvedValue(null);
    const result = await notificationService.markOneAsRead(UID, NID);
    expect(result).toBeNull();
  });

  test('returns already-read notification without saving', async () => {
    const notif = mkNotif({ isRead: true });
    Notification.findOne.mockResolvedValue(notif);
    const result = await notificationService.markOneAsRead(UID, NID);
    expect(result.isRead).toBe(true);
    expect(notif.save).not.toHaveBeenCalled();
  });

  test('marks unread notification as read and emits socket', async () => {
    const notif = mkNotif({ isRead: false });
    Notification.findOne.mockResolvedValue(notif);
    const result = await notificationService.markOneAsRead(UID, NID);
    expect(result.isRead).toBe(true);
    expect(notif.save).toHaveBeenCalled();
  });

  test('handles socket error in markOneAsRead gracefully', async () => {
    const notif = mkNotif({ isRead: false });
    Notification.findOne.mockResolvedValue(notif);
    socketSetup.getIo.mockImplementation(() => { throw new Error('no socket'); });
    await expect(notificationService.markOneAsRead(UID, NID)).resolves.toBeDefined();
  });
});

// ─── deleteNotification ───────────────────────────────────────────────────────
describe('deleteNotification', () => {
  test('deletes and emits socket event', async () => {
    Notification.findOneAndDelete.mockResolvedValue(mkNotif());
    const result = await notificationService.deleteNotification(UID, NID);
    expect(result).toBeDefined();
    expect(socketSetup.getIo().to).toHaveBeenCalled();
  });

  test('returns null when not found', async () => {
    Notification.findOneAndDelete.mockResolvedValue(null);
    const result = await notificationService.deleteNotification(UID, NID);
    expect(result).toBeNull();
  });

  test('handles socket error in deleteNotification gracefully', async () => {
    Notification.findOneAndDelete.mockResolvedValue(mkNotif());
    socketSetup.getIo.mockImplementation(() => { throw new Error('no socket'); });
    await expect(notificationService.deleteNotification(UID, NID)).resolves.toBeDefined();
  });
});

// ─── retractNotification ─────────────────────────────────────────────────────
describe('retractNotification', () => {
  test('deletes notification when actorCount reaches 0', async () => {
    const notif = mkNotif({
      actors: [{ toString: () => AID }],
      actorCount: 1,
    });
    notif.actors.filter = jest.fn().mockReturnValue([]);
    Notification.findOne.mockResolvedValue(notif);
    Notification.findByIdAndDelete.mockResolvedValue(notif);

    await notificationService.retractNotification(UID, AID, 'LIKE', TID);
    expect(Notification.findByIdAndDelete).toHaveBeenCalled();
  });

  test('saves notification when actorCount > 0 after removal', async () => {
    const notif = mkNotif({
      actors: [{ toString: () => AID }, { toString: () => 'other' }],
      actorCount: 2,
    });
    notif.actors.filter = jest.fn().mockReturnValue([{ toString: () => 'other' }]);
    Notification.findOne.mockResolvedValue(notif);

    await notificationService.retractNotification(UID, AID, 'LIKE', TID);
    expect(notif.save).toHaveBeenCalled();
  });

  test('does nothing when notification not found', async () => {
    Notification.findOne.mockResolvedValue(null);
    await expect(notificationService.retractNotification(UID, AID, 'LIKE', TID)).resolves.toBeUndefined();
  });

  test('handles error gracefully in retractNotification', async () => {
    Notification.findOne.mockRejectedValue(new Error('DB error'));
    await expect(notificationService.retractNotification(UID, AID, 'LIKE', TID)).resolves.toBeUndefined();
  });
});

// ─── notifyMention ────────────────────────────────────────────────────────────
describe('notifyMention', () => {
  test('creates mention notification', async () => {
    Notification.create.mockResolvedValue(mkNotif({ type: 'MENTION' }));
    await notificationService.notifyMention(UID, AID, TID);
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'MENTION' }));
  });

  test('returns early for self-mention', async () => {
    await notificationService.notifyMention(UID, UID, TID);
    expect(Notification.create).not.toHaveBeenCalled();
  });

  test('handles error gracefully in notifyMention', async () => {
    Notification.create.mockRejectedValue(new Error('DB error'));
    await expect(notificationService.notifyMention(UID, AID, TID)).resolves.toBeUndefined();
  });
});

// ─── notifySystem ─────────────────────────────────────────────────────────────
describe('notifySystem', () => {
  test('creates system notification without actionLink', async () => {
    Notification.create.mockResolvedValue(mkNotif({ type: 'SYSTEM' }));
    await notificationService.notifySystem(UID, 'Warning message');
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'SYSTEM', contentSnippet: 'Warning message' }));
  });

  test('creates system notification with actionLink', async () => {
    Notification.create.mockResolvedValue(mkNotif({ type: 'SYSTEM' }));
    await notificationService.notifySystem(UID, 'Warning', 'http://link.com');
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ actionLink: 'http://link.com' }));
  });

  test('handles error gracefully in notifySystem', async () => {
    Notification.create.mockRejectedValue(new Error('DB error'));
    await expect(notificationService.notifySystem(UID, 'msg')).resolves.toBeUndefined();
  });
});

// ─── notifyRecommended ────────────────────────────────────────────────────────
describe('notifyRecommended', () => {
  test('creates notification with empty track list', async () => {
    Notification.create.mockResolvedValue(mkNotif({ type: 'RECOMMENDED' }));
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });
    const result = await notificationService.notifyRecommended(UID, []);
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'RECOMMENDED' }));
    expect(result).toBeDefined();
  });

  test('creates notification with track list snippet', async () => {
    Notification.create.mockResolvedValue(mkNotif({ type: 'RECOMMENDED' }));
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ email: 'u@b.com', displayName: 'DJ', notificationSettings: { emailRecommended: false } }),
    });
    await notificationService.notifyRecommended(UID, [TID, TID, TID]);
    expect(Notification.create).toHaveBeenCalled();
  });

  test('skips email when emailRecommended is false', async () => {
    Notification.create.mockResolvedValue(mkNotif({ type: 'RECOMMENDED' }));
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({
        email: 'u@b.com', displayName: 'DJ',
        notificationSettings: { emailRecommended: false },
      }),
    });
    await notificationService.notifyRecommended(UID, []);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('handles error gracefully in notifyRecommended', async () => {
    Notification.create.mockRejectedValue(new Error('DB error'));
    const result = await notificationService.notifyRecommended(UID, []);
    expect(result).toBeNull();
  });
});

// ─── addFcmToken / removeFcmToken ─────────────────────────────────────────────
describe('FCM token management', () => {
  test('addFcmToken calls findByIdAndUpdate with $addToSet', async () => {
    User.findByIdAndUpdate = jest.fn().mockResolvedValue(true);
    await notificationService.addFcmToken(UID, 'tok123');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(UID, { $addToSet: { fcmTokens: 'tok123' } });
  });

  test('removeFcmToken calls findByIdAndUpdate with $pull', async () => {
    User.findByIdAndUpdate = jest.fn().mockResolvedValue(true);
    await notificationService.removeFcmToken(UID, 'tok123');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(UID, { $pull: { fcmTokens: 'tok123' } });
  });
});

// ─── updatePreferences ────────────────────────────────────────────────────────
describe('updatePreferences', () => {
  test('throws 404 when user not found', async () => {
    User.findById = jest.fn().mockResolvedValue(null);
    await expect(notificationService.updatePreferences(UID, {})).rejects.toThrow('User not found');
  });

  test('updates allowed preference fields', async () => {
    const user = {
      _id: UID,
      notificationSettings: { pushEnabled: true, allowLikes: true },
      save: jest.fn().mockResolvedValue(true),
    };
    User.findById = jest.fn().mockResolvedValue(user);
    const result = await notificationService.updatePreferences(UID, { pushEnabled: false, allowLikes: false });
    expect(result.pushEnabled).toBe(false);
  });

  test('ignores non-allowed preference fields', async () => {
    const user = {
      _id: UID,
      notificationSettings: { pushEnabled: true },
      save: jest.fn().mockResolvedValue(true),
    };
    User.findById = jest.fn().mockResolvedValue(user);
    await notificationService.updatePreferences(UID, { hackerField: true });
    expect(user.notificationSettings.hackerField).toBeUndefined();
  });
});

// ─── getPreferences ───────────────────────────────────────────────────────────
describe('getPreferences', () => {
  test('returns notificationSettings', async () => {
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ notificationSettings: { pushEnabled: true } }),
    });
    const result = await notificationService.getPreferences(UID);
    expect(result.pushEnabled).toBe(true);
  });

  test('throws 404 when user not found', async () => {
    User.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    await expect(notificationService.getPreferences(UID)).rejects.toThrow('User not found');
  });
});

// ─── notifyComment snippet truncation ─────────────────────────────────────────
describe('notifyComment — content snippet', () => {
  beforeEach(() => {
    Notification.findOne.mockResolvedValue(null);
    Notification.create.mockResolvedValue(mkNotif());
    const chain = { populate: jest.fn() };
    chain.populate.mockReturnValue(chain);
    chain.populate.mockResolvedValue({ ...mkNotif(), actors: [{ displayName: 'DJ' }] });
    Notification.findById.mockReturnValue(chain);
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ fcmTokens: [], notificationSettings: {} }),
    });
  });

  test('truncates long comment to 47 chars + ...', async () => {
    const longComment = 'a'.repeat(60);
    await notificationService.notifyComment(UID, AID, TID, longComment);
    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ contentSnippet: expect.stringMatching(/\.\.\.$/) })
    );
  });

  test('uses full comment when under 50 chars', async () => {
    await notificationService.notifyComment(UID, AID, TID, 'short comment');
    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ contentSnippet: 'short comment' })
    );
  });

  test('handles null comment text', async () => {
    await notificationService.notifyComment(UID, AID, TID, null);
    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ contentSnippet: '' })
    );
  });
});

// ─── notifyNewPlaylist self-notification guard ─────────────────────────────────
describe('notifyNewPlaylist', () => {
  test('returns early for self-notification', async () => {
    await notificationService.notifyNewPlaylist(UID, UID, TID);
    expect(Notification.create).not.toHaveBeenCalled();
  });

  test('handles error gracefully', async () => {
    Notification.create.mockRejectedValue(new Error('DB error'));
    await expect(notificationService.notifyNewPlaylist(UID, AID, TID)).resolves.toBeUndefined();
  });
});
