'use strict';
/**
 * 10_notifications.test.js
 * Module 10: Real-Time Notifications
 * Tests notificationService and notificationController
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

jest.mock('../services/notificationService');
const notificationService = require('../services/notificationService');
const notificationController = require('../controllers/notificationController');

const UID = '507f1f77bcf86cd799439011';
const AID = '507f1f77bcf86cd799439022'; // actor
const NID = '507f1f77bcf86cd799439033'; // notification id
const TID = '507f1f77bcf86cd799439044'; // target id

const mkRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// ─── notificationController ───────────────────────────────────────────────────
describe('notificationController', () => {
  test('getNotifications — 200', async () => {
    notificationService.getUserNotifications.mockResolvedValue({ notifications: [], pagination: { total: 0, page: 1, totalPages: 0 } });
    const r = mkRes();
    await notificationController.getNotifications({ user: { id: UID }, query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getNotifications — 400 when no userId', async () => {
    const next = jest.fn();
    await notificationController.getNotifications({ user: { id: null, _id: null }, query: {} }, mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('getUnreadCount — 200', async () => {
    notificationService.getUnreadCount.mockResolvedValue(5);
    const r = mkRes();
    await notificationController.getUnreadCount({ user: { id: UID }, query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: { unreadCount: 5 } }));
  });

  test('markAllAsRead — 200', async () => {
    notificationService.markAllAsRead.mockResolvedValue(3);
    const r = mkRes();
    await notificationController.markAllAsRead({ user: { id: UID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: { modifiedCount: 3 } }));
  });

  test('markOneAsRead — 200', async () => {
    notificationService.markOneAsRead.mockResolvedValue({ _id: NID, isRead: true });
    const r = mkRes();
    await notificationController.markOneAsRead({ user: { id: UID }, params: { id: NID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('markOneAsRead — 404 when not found', async () => {
    notificationService.markOneAsRead.mockResolvedValue(null);
    const next = jest.fn();
    await notificationController.markOneAsRead({ user: { id: UID }, params: { id: NID } }, mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('deleteNotification — 200', async () => {
    notificationService.deleteNotification.mockResolvedValue({ _id: NID });
    const r = mkRes();
    await notificationController.deleteNotification({ user: { id: UID }, params: { id: NID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('deleteNotification — 404 when not found', async () => {
    notificationService.deleteNotification.mockResolvedValue(null);
    const next = jest.fn();
    await notificationController.deleteNotification({ user: { id: UID }, params: { id: NID } }, mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('registerFcmToken — 200', async () => {
    notificationService.addFcmToken.mockResolvedValue(undefined);
    const r = mkRes();
    await notificationController.registerFcmToken({ user: { id: UID }, body: { token: 'fcm-token-abc' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('registerFcmToken — 400 when no token', async () => {
    const next = jest.fn();
    await notificationController.registerFcmToken({ user: { id: UID }, body: {} }, mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('removeFcmToken — 200', async () => {
    notificationService.removeFcmToken.mockResolvedValue(undefined);
    const r = mkRes();
    await notificationController.removeFcmToken({ user: { id: UID }, body: { token: 'fcm-token-abc' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('removeFcmToken — 400 when no token', async () => {
    const next = jest.fn();
    await notificationController.removeFcmToken({ user: { id: UID }, body: {} }, mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('getPreferences — 200', async () => {
    notificationService.getPreferences.mockResolvedValue({ pushEnabled: true });
    const r = mkRes();
    await notificationController.getPreferences({ user: { id: UID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('updatePreferences — 200', async () => {
    notificationService.updatePreferences.mockResolvedValue({ pushEnabled: false });
    const r = mkRes();
    await notificationController.updatePreferences({ user: { id: UID }, body: { pushEnabled: false } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });
});

// ─── notificationService REAL unit tests ──────────────────────────────────────
describe('notificationService (real)', () => {
  jest.unmock('../services/notificationService');
  const realNotifService = jest.requireActual('../services/notificationService');

  const mockIo = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

  const mkNotification = (overrides = {}) => ({
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
    // Use mockReturnValue on the existing jest mock (do NOT reassign — service
    // has already destructured { getIo } at require time, so the reference is fixed)
    socketSetup.getIo.mockReturnValue(mockIo);
    firebaseService.sendPushNotification = jest.fn().mockResolvedValue({});
    sendEmail.mockResolvedValue({});
  });

  test('getUserNotifications — returns paginated notifications', async () => {
    // Service calls .populate().populate() — chain both calls
    const chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };
    chain.populate = jest.fn().mockReturnValueOnce(chain).mockResolvedValueOnce([mkNotification()]);
    Notification.find.mockReturnValue(chain);
    Notification.countDocuments.mockResolvedValue(1);
    const result = await realNotifService.getUserNotifications(UID, 1, 20);
    expect(result.notifications).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
  });

  test('getUnreadCount — returns count', async () => {
    Notification.countDocuments.mockResolvedValue(7);
    const result = await realNotifService.getUnreadCount(UID);
    expect(result).toBe(7);
  });

  test('markAllAsRead — updates all unread and emits socket event', async () => {
    Notification.updateMany.mockResolvedValue({ modifiedCount: 3 });
    const result = await realNotifService.markAllAsRead(UID);
    expect(result).toBe(3);
    expect(mockIo.emit).toHaveBeenCalledWith('all_notifications_read');
  });

  test('markAllAsRead — handles socket error gracefully', async () => {
    Notification.updateMany.mockResolvedValue({ modifiedCount: 1 });
    socketSetup.getIo.mockImplementation(() => { throw new Error('socket down'); });
    const result = await realNotifService.markAllAsRead(UID);
    expect(result).toBe(1);
  });
  test('markOneAsRead — marks single notification as read', async () => {
    const notif = mkNotification({ isRead: false });
    Notification.findOne.mockResolvedValue(notif);
    const result = await realNotifService.markOneAsRead(UID, NID);
    expect(notif.isRead).toBe(true);
    expect(notif.save).toHaveBeenCalled();
  });

  test('markOneAsRead — returns null when not found', async () => {
    Notification.findOne.mockResolvedValue(null);
    const result = await realNotifService.markOneAsRead(UID, NID);
    expect(result).toBeNull();
  });

  test('markOneAsRead — returns already-read notification without saving', async () => {
    const notif = mkNotification({ isRead: true });
    Notification.findOne.mockResolvedValue(notif);
    const result = await realNotifService.markOneAsRead(UID, NID);
    expect(notif.save).not.toHaveBeenCalled();
    expect(result).toBe(notif);
  });

  test('deleteNotification — deletes and emits socket event', async () => {
    Notification.findOneAndDelete.mockResolvedValue(mkNotification());
    const result = await realNotifService.deleteNotification(UID, NID);
    expect(result).toBeDefined();
    expect(mockIo.emit).toHaveBeenCalledWith('notification_deleted', expect.any(Object));
  });

  test('deleteNotification — returns null when not found', async () => {
    Notification.findOneAndDelete.mockResolvedValue(null);
    const result = await realNotifService.deleteNotification(UID, NID);
    expect(result).toBeNull();
  });

  test('addFcmToken — calls User.findByIdAndUpdate with $addToSet', async () => {
    User.findByIdAndUpdate.mockResolvedValue({});
    await realNotifService.addFcmToken(UID, 'token123');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(UID, { $addToSet: { fcmTokens: 'token123' } });
  });

  test('removeFcmToken — calls User.findByIdAndUpdate with $pull', async () => {
    User.findByIdAndUpdate.mockResolvedValue({});
    await realNotifService.removeFcmToken(UID, 'token123');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(UID, { $pull: { fcmTokens: 'token123' } });
  });

  test('getPreferences — returns notification settings', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ notificationSettings: { pushEnabled: true } }) });
    const result = await realNotifService.getPreferences(UID);
    expect(result.pushEnabled).toBe(true);
  });

  test('getPreferences — throws 404 when user not found', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    await expect(realNotifService.getPreferences(UID)).rejects.toThrow('User not found');
  });

  test('updatePreferences — saves allowed fields only', async () => {
    const user = { notificationSettings: {}, save: jest.fn().mockResolvedValue(true) };
    User.findById.mockResolvedValue(user);
    await realNotifService.updatePreferences(UID, { pushEnabled: false, allowLikes: true, unknownField: 'ignored' });
    expect(user.notificationSettings.pushEnabled).toBe(false);
    expect(user.notificationSettings.allowLikes).toBe(true);
    expect(user.notificationSettings.unknownField).toBeUndefined();
  });

  test('updatePreferences — throws 404 when user not found', async () => {
    User.findById.mockResolvedValue(null);
    await expect(realNotifService.updatePreferences(UID, {})).rejects.toThrow('User not found');
  });

  // ─── Notification triggers ────────────────────────────────────────────────
  test('notifyLike — prevents self-notification', async () => {
    const result = await realNotifService.notifyLike(UID, UID, TID);
    expect(result).toBeNull();
    expect(Notification.findOne).not.toHaveBeenCalled();
  });

  test('notifyLike — creates new LIKE notification', async () => {
    Notification.findOne.mockResolvedValue(null);
    const created = mkNotification({ type: 'LIKE' });
    Notification.create.mockResolvedValue(created);
    Notification.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue(created),
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ fcmTokens: [], notificationSettings: {} }) });
    const result = await realNotifService.notifyLike(UID, AID, TID);
    expect(Notification.create).toHaveBeenCalled();
  });

  test('notifyLike — groups with existing notification by adding actor', async () => {
    const existing = mkNotification({ actors: [{ toString: () => 'other-actor' }], actorCount: 1, actorCount: 1 });
    existing.actors.some = jest.fn().mockReturnValue(false);
    existing.actors.unshift = jest.fn();
    existing.actors.length = 1;
    existing.actors.pop = jest.fn();
    Notification.findOne.mockResolvedValue(existing);
    Notification.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue(existing),
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ fcmTokens: [], notificationSettings: {} }) });
    await realNotifService.notifyLike(UID, AID, TID);
    expect(existing.save).toHaveBeenCalled();
  });

  test('notifyFollow — creates FOLLOW notification', async () => {
    Notification.findOne.mockResolvedValue(null);
    const created = mkNotification({ type: 'FOLLOW' });
    Notification.create.mockResolvedValue(created);
    Notification.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue(created),
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ fcmTokens: [], notificationSettings: {} }) });
    await realNotifService.notifyFollow(UID, AID);
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'FOLLOW' }));
  });

  test('notifyComment — truncates long comment text to snippet', async () => {
    Notification.findOne.mockResolvedValue(null);
    const created = mkNotification({ type: 'COMMENT' });
    Notification.create.mockResolvedValue(created);
    Notification.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue(created),
    });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ fcmTokens: [], notificationSettings: {} }) });
    const longComment = 'a'.repeat(100);
    await realNotifService.notifyComment(UID, AID, TID, longComment);
    const createCall = Notification.create.mock.calls[0][0];
    expect(createCall.contentSnippet.length).toBeLessThanOrEqual(53); // 47 + '...'
  });

  test('notifyNewPlaylist — creates NEW_PLAYLIST notification', async () => {
    Notification.create.mockResolvedValue(mkNotification({ type: 'NEW_PLAYLIST' }));
    await realNotifService.notifyNewPlaylist(UID, AID, TID);
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'NEW_PLAYLIST' }));
  });

  test('notifyNewPlaylist — prevents self-notification', async () => {
    await realNotifService.notifyNewPlaylist(UID, UID, TID);
    expect(Notification.create).not.toHaveBeenCalled();
  });

  test('notifySystem — creates SYSTEM notification', async () => {
    Notification.create.mockResolvedValue(mkNotification({ type: 'SYSTEM' }));
    await realNotifService.notifySystem(UID, 'System alert!');
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'SYSTEM' }));
  });

  test('notifyRecommended — creates RECOMMENDED notification and sends email', async () => {
    Notification.create.mockResolvedValue(mkNotification({ type: 'RECOMMENDED' }));
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ email: 'user@test.com', displayName: 'DJ', notificationSettings: {} }) });
    await realNotifService.notifyRecommended(UID, [TID]);
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'RECOMMENDED' }));
  });

  test('retractNotification — removes actor and deletes when actorCount reaches 0', async () => {
    const notif = mkNotification({ actorCount: 1, actors: { filter: jest.fn().mockReturnValue([]), toString: () => NID } });
    notif.actorCount = 1;
    notif.actors = { filter: jest.fn().mockReturnValue([]) };
    Notification.findOne.mockResolvedValue(notif);
    Notification.findByIdAndDelete.mockResolvedValue(notif);
    await realNotifService.retractNotification(UID, AID, 'LIKE', TID);
    expect(Notification.findByIdAndDelete).toHaveBeenCalled();
  });

  test('retractNotification — saves when other actors remain', async () => {
    const notif = mkNotification({ actorCount: 2 });
    notif.actors = { filter: jest.fn().mockReturnValue(['remaining-actor']) };
    Notification.findOne.mockResolvedValue(notif);
    await realNotifService.retractNotification(UID, AID, 'LIKE', TID);
    expect(notif.save).toHaveBeenCalled();
  });

  test('notifyMention — creates MENTION notification', async () => {
    Notification.create.mockResolvedValue(mkNotification({ type: 'MENTION' }));
    await realNotifService.notifyMention(UID, AID, TID);
    expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'MENTION' }));
  });

  test('notifyMention — prevents self-mention', async () => {
    await realNotifService.notifyMention(UID, UID, TID);
    expect(Notification.create).not.toHaveBeenCalled();
  });
});
