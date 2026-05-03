'use strict';
/**
 * 09_messaging.test.js
 * Module 9: Messaging & Track Sharing
 * Tests messageService and messageController
 */

jest.mock('../models/conversationModel');
jest.mock('../models/messageModel');
jest.mock('../models/blockModel');
jest.mock('../models/trackModel');
jest.mock('../models/userModel');
jest.mock('../models/followModel');
jest.mock('../sockets/socketSetup');
jest.mock('../services/notificationService');

const Conversation = require('../models/conversationModel');
const Message = require('../models/messageModel');
const Block = require('../models/blockModel');
const Track = require('../models/trackModel');
const User = require('../models/userModel');
const Follow = require('../models/followModel');
const socketSetup = require('../sockets/socketSetup');
const notificationService = require('../services/notificationService');

jest.mock('../services/messageService');
const messageService = require('../services/messageService');
const messageController = require('../controllers/messageController');

const UID = '507f1f77bcf86cd799439011';
const RID = '507f1f77bcf86cd799439022';
const MID = '507f1f77bcf86cd799439033';
const CID = '507f1f77bcf86cd799439044';
const TID = '507f1f77bcf86cd799439055';

const mkRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const mkMsg = (overrides = {}) => ({
  _id: MID, conversationId: CID, senderId: UID, content: 'Hello',
  isDeleted: false, isEdited: false, deletedFor: [],
  status: 'sent', createdAt: new Date(),
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

// ─── messageController ────────────────────────────────────────────────────────
describe('messageController', () => {
  test('sendMessage — 201 with content', async () => {
    messageService.sendMessage.mockResolvedValue(mkMsg());
    const r = mkRes();
    await messageController.sendMessage({ user: { _id: UID }, body: { receiverId: RID, content: 'Hello' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(201);
  });

  test('sendMessage — 400 when no receiverId', async () => {
    const next = jest.fn();
    await messageController.sendMessage({ user: { _id: UID }, body: {} }, mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('sendMessage — 400 when sending to self', async () => {
    const next = jest.fn();
    await messageController.sendMessage({ user: { _id: UID }, body: { receiverId: UID, content: 'Self' } }, mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('sendMessage — 400 when no content and no attachment', async () => {
    const next = jest.fn();
    await messageController.sendMessage({ user: { _id: UID }, body: { receiverId: RID } }, mkRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('sendMessage — passes attachment when attachmentType provided', async () => {
    messageService.sendMessage.mockResolvedValue(mkMsg({ attachment: { type: 'track', referenceId: TID } }));
    const r = mkRes();
    await messageController.sendMessage({ user: { _id: UID }, body: { receiverId: RID, attachmentType: 'track', attachmentId: TID } }, r, jest.fn());
    expect(messageService.sendMessage).toHaveBeenCalledWith(UID, RID, undefined, null, { type: 'track', referenceId: TID });
    expect(r.status).toHaveBeenCalledWith(201);
  });

  test('getUserConversations — 200', async () => {
    messageService.getUserConversations.mockResolvedValue({ conversations: [], hasMore: false });
    const r = mkRes();
    await messageController.getUserConversations({ user: { _id: UID }, query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('getConversationMessages — 200', async () => {
    messageService.getConversationMessages.mockResolvedValue({ messages: [], hasMore: false });
    const r = mkRes();
    await messageController.getConversationMessages({ user: { _id: UID }, params: { conversationId: CID }, query: {} }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('hideConversation — 200', async () => {
    messageService.hideConversation.mockResolvedValue(true);
    const r = mkRes();
    await messageController.hideConversation({ user: { _id: UID }, params: { conversationId: CID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('editMessage — 200', async () => {
    messageService.editMessage.mockResolvedValue(mkMsg({ content: 'Edited', isEdited: true }));
    const r = mkRes();
    await messageController.editMessage({ user: { _id: UID }, params: { messageId: MID }, body: { content: 'Edited' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('deleteMessageForEveryone — 200', async () => {
    messageService.deleteMessageForEveryone.mockResolvedValue(mkMsg({ isDeleted: true }));
    const r = mkRes();
    await messageController.deleteMessageForEveryone({ user: { _id: UID }, params: { messageId: MID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('deleteMessageForMe — 200', async () => {
    messageService.deleteMessageForMe.mockResolvedValue(true);
    const r = mkRes();
    await messageController.deleteMessageForMe({ user: { _id: UID }, params: { messageId: MID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
  });

  test('markAsRead — 200 with count', async () => {
    messageService.markMessagesAsRead.mockResolvedValue(3);
    const r = mkRes();
    await messageController.markAsRead({ user: { _id: UID }, params: { conversationId: CID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ updatedCount: 3 }));
  });

  test('markAsRead — 200 when already read', async () => {
    messageService.markMessagesAsRead.mockResolvedValue(0);
    const r = mkRes();
    await messageController.markAsRead({ user: { _id: UID }, params: { conversationId: CID } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ updatedCount: 0 }));
  });
});

// ─── messageService REAL unit tests ──────────────────────────────────────────
describe('messageService (real)', () => {
  jest.unmock('../services/messageService');
  const realMessageService = jest.requireActual('../services/messageService');

  // Mock socket setup
  const mockIo = {
    sockets: { adapter: { rooms: new Map() } },
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };
  socketSetup.getIo = jest.fn().mockReturnValue(mockIo);
  socketSetup.connectedUsers = new Map();

  const mkConversation = (overrides = {}) => ({
    _id: CID,
    participants: [UID, RID],
    unreadCounts: { get: jest.fn().mockReturnValue(0), set: jest.fn() },
    hiddenBy: [],
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    socketSetup.getIo = jest.fn().mockReturnValue(mockIo);
    socketSetup.connectedUsers = new Map();
  });

  test('sendMessage — creates new message and conversation', async () => {
    Block.exists.mockResolvedValue(false);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ notificationSettings: {} }) });
    Conversation.findOne.mockResolvedValue(null);
    const conv = mkConversation();
    Conversation.mockImplementation(() => conv);
    const msg = mkMsg();
    Message.mockImplementation(() => msg);
    notificationService.notifyMessage = jest.fn();
    const result = await realMessageService.sendMessage(UID, RID, 'Hello', null, null);
    expect(msg.save).toHaveBeenCalled();
    expect(result.content).toBe('Hello');
  });

  test('sendMessage — throws 403 when blocked', async () => {
    Block.exists.mockResolvedValue(true);
    await expect(realMessageService.sendMessage(UID, RID, 'Hello', null, null)).rejects.toThrow('blocked');
  });

  test('sendMessage — throws 404 when receiver not found', async () => {
    Block.exists.mockResolvedValue(false);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    await expect(realMessageService.sendMessage(UID, RID, 'Hello', null, null)).rejects.toThrow('recipient user was not found');
  });

  test('sendMessage — throws 403 when receiver only accepts messages from following', async () => {
    Block.exists.mockResolvedValue(false);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ notificationSettings: { messagePermission: 'Following' } }) });
    Follow.exists.mockResolvedValue(false);
    await expect(realMessageService.sendMessage(UID, RID, 'Hello', null, null)).rejects.toThrow('only accepts messages from people they follow');
  });

  test('sendMessage — throws 404 when attached track not found', async () => {
    Block.exists.mockResolvedValue(false);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ notificationSettings: {} }) });
    Track.findById.mockResolvedValue(null);
    await expect(realMessageService.sendMessage(UID, RID, null, null, { type: 'track', referenceId: TID })).rejects.toThrow('attached track does not exist');
  });

  test('sendMessage — throws 403 when sharing private track not owned', async () => {
    Block.exists.mockResolvedValue(false);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ notificationSettings: {} }) });
    Track.findById.mockResolvedValue({ _id: TID, isPublic: false, artist: { toString: () => 'someone-else' } });
    await expect(realMessageService.sendMessage(UID, RID, null, null, { type: 'track', referenceId: TID })).rejects.toThrow('cannot share a private track');
  });

  test('editMessage — edits and saves message within time limit', async () => {
    const msg = mkMsg({ createdAt: new Date() });
    Message.findById.mockResolvedValue(msg);
    const conv = mkConversation();
    Conversation.findById.mockResolvedValue(conv);
    const result = await realMessageService.editMessage(MID, UID, 'Edited text');
    expect(msg.content).toBe('Edited text');
    expect(msg.isEdited).toBe(true);
    expect(msg.save).toHaveBeenCalled();
  });

  test('editMessage — throws 404 when not found', async () => {
    Message.findById.mockResolvedValue(null);
    await expect(realMessageService.editMessage(MID, UID, 'text')).rejects.toThrow('Message not found');
  });

  test('editMessage — throws 403 when not sender', async () => {
    Message.findById.mockResolvedValue(mkMsg({ senderId: { toString: () => 'other' } }));
    await expect(realMessageService.editMessage(MID, UID, 'text')).rejects.toThrow('only edit your own messages');
  });

  test('editMessage — throws 400 when message deleted', async () => {
    Message.findById.mockResolvedValue(mkMsg({ isDeleted: true }));
    await expect(realMessageService.editMessage(MID, UID, 'text')).rejects.toThrow('Cannot edit a deleted message');
  });

  test('editMessage — throws 403 when past 15-minute window', async () => {
    const oldDate = new Date(Date.now() - 20 * 60 * 1000); // 20 min ago
    Message.findById.mockResolvedValue(mkMsg({ createdAt: oldDate }));
    await expect(realMessageService.editMessage(MID, UID, 'text')).rejects.toThrow('within 15 minutes');
  });

  test('deleteMessageForEveryone — marks as deleted', async () => {
    const msg = mkMsg({ createdAt: new Date() });
    Message.findById.mockResolvedValue(msg);
    const conv = mkConversation();
    Conversation.findById.mockResolvedValue(conv);
    const result = await realMessageService.deleteMessageForEveryone(MID, UID);
    expect(msg.isDeleted).toBe(true);
    expect(msg.content).toBe('This message was deleted');
  });

  test('deleteMessageForEveryone — throws 404 when not found', async () => {
    Message.findById.mockResolvedValue(null);
    await expect(realMessageService.deleteMessageForEveryone(MID, UID)).rejects.toThrow('Message not found');
  });

  test('deleteMessageForEveryone — throws 403 when not sender', async () => {
    Message.findById.mockResolvedValue(mkMsg({ senderId: { toString: () => 'other' } }));
    await expect(realMessageService.deleteMessageForEveryone(MID, UID)).rejects.toThrow('only unsend your own messages');
  });

  test('deleteMessageForEveryone — throws 400 when already deleted', async () => {
    Message.findById.mockResolvedValue(mkMsg({ isDeleted: true }));
    await expect(realMessageService.deleteMessageForEveryone(MID, UID)).rejects.toThrow('already been deleted');
  });

  test('deleteMessageForEveryone — throws 403 when past time limit', async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000);
    Message.findById.mockResolvedValue(mkMsg({ createdAt: old }));
    await expect(realMessageService.deleteMessageForEveryone(MID, UID)).rejects.toThrow('within 15 minutes');
  });

  test('deleteMessageForMe — adds userId to deletedFor', async () => {
    const msg = mkMsg({ deletedFor: { includes: jest.fn().mockReturnValue(false), push: jest.fn() } });
    Message.findById.mockResolvedValue(msg);
    const result = await realMessageService.deleteMessageForMe(MID, UID);
    expect(msg.deletedFor.push).toHaveBeenCalledWith(UID);
    expect(result).toBe(true);
  });

  test('deleteMessageForMe — throws 400 when already deleted for user', async () => {
    const msg = mkMsg({ deletedFor: { includes: jest.fn().mockReturnValue(true) } });
    Message.findById.mockResolvedValue(msg);
    await expect(realMessageService.deleteMessageForMe(MID, UID)).rejects.toThrow('already deleted');
  });

  test('deleteMessageForMe — throws 404 when not found', async () => {
    Message.findById.mockResolvedValue(null);
    await expect(realMessageService.deleteMessageForMe(MID, UID)).rejects.toThrow('Message not found');
  });

  test('markMessagesAsRead — resets unread count and marks messages', async () => {
    const conv = mkConversation({ participants: [{ toString: () => UID }, { toString: () => RID }] });
    conv.unreadCounts.get.mockReturnValue(2);
    Conversation.findById.mockResolvedValue(conv);
    Message.updateMany.mockResolvedValue({ modifiedCount: 2 });
    const result = await realMessageService.markMessagesAsRead(CID, UID);
    expect(conv.unreadCounts.set).toHaveBeenCalledWith(UID, 0);
    expect(result).toBe(2);
  });

  test('markMessagesAsRead — throws 404 when conversation not found', async () => {
    Conversation.findById.mockResolvedValue(null);
    await expect(realMessageService.markMessagesAsRead(CID, UID)).rejects.toThrow('Conversation not found');
  });

  test('hideConversation — adds user to hiddenBy and clears history', async () => {
    const conv = mkConversation({ hiddenBy: { includes: jest.fn().mockReturnValue(false), push: jest.fn() } });
    Conversation.findOne.mockResolvedValue(conv);
    Message.updateMany.mockResolvedValue({});
    const result = await realMessageService.hideConversation(CID, UID);
    expect(conv.hiddenBy.push).toHaveBeenCalledWith(UID);
    expect(Message.updateMany).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  test('hideConversation — throws 404 when conversation not found', async () => {
    Conversation.findOne.mockResolvedValue(null);
    await expect(realMessageService.hideConversation(CID, UID)).rejects.toThrow('Conversation not found');
  });

  test('hideConversation — throws 400 when already hidden', async () => {
    const conv = mkConversation({ hiddenBy: { includes: jest.fn().mockReturnValue(true) } });
    Conversation.findOne.mockResolvedValue(conv);
    await expect(realMessageService.hideConversation(CID, UID)).rejects.toThrow('already hidden');
  });

  test('getUserConversations — returns formatted list', async () => {
    const conv = mkConversation({
      participants: [{ _id: { toString: () => UID }, displayName: 'Me' }, { _id: { toString: () => RID }, displayName: 'Other' }],
      lastMessage: null,
      updatedAt: new Date(),
    });
    Conversation.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([conv]),
    });
    const result = await realMessageService.getUserConversations(UID, 1, 20);
    expect(result.conversations).toHaveLength(1);
  });

  test('getConversationMessages — returns paginated messages', async () => {
    Conversation.findOne.mockResolvedValue(mkConversation());
    Message.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([mkMsg()]),
    });
    const result = await realMessageService.getConversationMessages(CID, UID, 1, 20);
    expect(result.messages).toBeDefined();
  });

  test('getConversationMessages — throws 404 when conversation not found', async () => {
    Conversation.findOne.mockResolvedValue(null);
    await expect(realMessageService.getConversationMessages(CID, UID, 1, 20)).rejects.toThrow('Conversation not found');
  });
});
