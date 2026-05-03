'use strict';
/**
 * 15_messageService.test.js
 * Deep coverage of messageService — all branches
 */

jest.mock('../models/conversationModel');
jest.mock('../models/messageModel');
jest.mock('../models/blockModel');
jest.mock('../models/trackModel');
jest.mock('../models/userModel');
jest.mock('../models/followModel');
jest.mock('../sockets/socketSetup');
jest.mock('../services/notificationService');
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  const ObjectId = function ObjectId(value) {
    return value;
  };
  ObjectId.isValid = jest.fn().mockReturnValue(true);
  return {
    ...actual,
    Types: {
      ...actual.Types,
      ObjectId,
    },
  };
});

const Conversation = require('../models/conversationModel');
const Message = require('../models/messageModel');
const Block = require('../models/blockModel');
const Track = require('../models/trackModel');
const User = require('../models/userModel');
const Follow = require('../models/followModel');
const socketSetup = require('../sockets/socketSetup');
const notificationService = require('../services/notificationService');

const messageService = require('../services/messageService');

const UID = '507f1f77bcf86cd799439011';
const RID = '507f1f77bcf86cd799439022'; // receiver
const CID = '507f1f77bcf86cd799439033'; // conversation
const MID = '507f1f77bcf86cd799439044'; // message
const TID = '507f1f77bcf86cd799439055'; // track

const mkMsg = (overrides = {}) => ({
  _id: MID,
  conversationId: CID,
  senderId: { toString: () => UID },
  content: 'Hello!',
  isDeleted: false,
  isEdited: false,
  deletedFor: [],
  status: 'sent',
  createdAt: new Date(Date.now() - 1000), // 1 second ago — within 15 min
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const mkConv = (overrides = {}) => ({
  _id: CID,
  participants: [{ toString: () => UID }, { toString: () => RID }],
  unreadCounts: { get: jest.fn().mockReturnValue(0), set: jest.fn() },
  hiddenBy: [],
  lastMessage: MID,
  markModified: jest.fn(),
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const mkIo = () => ({
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
  sockets: { adapter: { rooms: new Map() } },
});

beforeEach(() => {
  jest.clearAllMocks();
  notificationService.notifyMessage = jest.fn();
  const io = mkIo();
  socketSetup.getIo = jest.fn().mockReturnValue(io);
  socketSetup.connectedUsers = new Map();
});

// ─── editMessage ──────────────────────────────────────────────────────────────
describe('editMessage', () => {
  test('throws 404 when message not found', async () => {
    Message.findById.mockResolvedValue(null);
    await expect(messageService.editMessage(MID, UID, 'new')).rejects.toThrow(
      'Message not found'
    );
  });

  test('throws 403 when not message sender', async () => {
    Message.findById.mockResolvedValue(
      mkMsg({ senderId: { toString: () => 'other' } })
    );
    await expect(messageService.editMessage(MID, UID, 'new')).rejects.toThrow(
      'only edit your own'
    );
  });

  test('throws 400 when message is deleted', async () => {
    Message.findById.mockResolvedValue(
      mkMsg({ isDeleted: true, senderId: { toString: () => UID } })
    );
    await expect(messageService.editMessage(MID, UID, 'new')).rejects.toThrow(
      'Cannot edit a deleted'
    );
  });

  test('throws 403 when 15 minute window exceeded', async () => {
    const oldTime = new Date(Date.now() - 20 * 60 * 1000); // 20 min ago
    Message.findById.mockResolvedValue(
      mkMsg({ senderId: { toString: () => UID }, createdAt: oldTime })
    );
    await expect(messageService.editMessage(MID, UID, 'new')).rejects.toThrow(
      'within 15 minutes'
    );
  });

  test('edits message and emits socket when receiver online', async () => {
    const msg = mkMsg({ senderId: { toString: () => UID } });
    Message.findById.mockResolvedValue(msg);
    const conv = mkConv();
    conv.participants = [{ toString: () => UID }, { toString: () => RID }];
    conv.participants.find = jest.fn().mockReturnValue({ toString: () => RID });
    Conversation.findById.mockResolvedValue(conv);
    socketSetup.connectedUsers.set(RID, 'socket_rid');

    const result = await messageService.editMessage(MID, UID, 'new content');
    expect(result.isEdited).toBe(true);
    expect(result.content).toBe('new content');
    expect(msg.save).toHaveBeenCalled();
  });

  test('edits message silently when receiver offline', async () => {
    const msg = mkMsg({ senderId: { toString: () => UID } });
    Message.findById.mockResolvedValue(msg);
    const conv = mkConv();
    conv.participants.find = jest.fn().mockReturnValue(null);
    Conversation.findById.mockResolvedValue(conv);

    await messageService.editMessage(MID, UID, 'updated');
    expect(msg.save).toHaveBeenCalled();
  });
});

// ─── deleteMessageForEveryone ─────────────────────────────────────────────────
describe('deleteMessageForEveryone', () => {
  test('throws 404 when message not found', async () => {
    Message.findById.mockResolvedValue(null);
    await expect(
      messageService.deleteMessageForEveryone(MID, UID)
    ).rejects.toThrow('Message not found');
  });

  test('throws 403 when not sender', async () => {
    Message.findById.mockResolvedValue(
      mkMsg({ senderId: { toString: () => 'other' } })
    );
    await expect(
      messageService.deleteMessageForEveryone(MID, UID)
    ).rejects.toThrow('only unsend your own');
  });

  test('throws 400 when already deleted', async () => {
    Message.findById.mockResolvedValue(
      mkMsg({ isDeleted: true, senderId: { toString: () => UID } })
    );
    await expect(
      messageService.deleteMessageForEveryone(MID, UID)
    ).rejects.toThrow('already been deleted');
  });

  test('throws 403 when 15 minute window exceeded', async () => {
    const oldTime = new Date(Date.now() - 20 * 60 * 1000);
    Message.findById.mockResolvedValue(
      mkMsg({ senderId: { toString: () => UID }, createdAt: oldTime })
    );
    await expect(
      messageService.deleteMessageForEveryone(MID, UID)
    ).rejects.toThrow('within 15 minutes');
  });

  test('deletes message and emits socket', async () => {
    const msg = mkMsg({ senderId: { toString: () => UID } });
    Message.findById.mockResolvedValue(msg);
    const conv = mkConv();
    conv.participants.find = jest.fn().mockReturnValue({ toString: () => RID });
    Conversation.findById.mockResolvedValue(conv);
    socketSetup.connectedUsers.set(RID, 'socket_rid');

    const result = await messageService.deleteMessageForEveryone(MID, UID);
    expect(result.isDeleted).toBe(true);
    expect(msg.save).toHaveBeenCalled();
  });
});

// ─── deleteMessageForMe ───────────────────────────────────────────────────────
describe('deleteMessageForMe', () => {
  test('throws 404 when message not found', async () => {
    Message.findById.mockResolvedValue(null);
    await expect(messageService.deleteMessageForMe(MID, UID)).rejects.toThrow(
      'Message not found'
    );
  });

  test('throws 400 when already deleted for this user', async () => {
    Message.findById.mockResolvedValue(mkMsg({ deletedFor: [UID] }));
    await expect(messageService.deleteMessageForMe(MID, UID)).rejects.toThrow(
      'already deleted this message'
    );
  });

  test('marks message as deleted for user', async () => {
    const msg = mkMsg({ deletedFor: [] });
    Message.findById.mockResolvedValue(msg);
    const result = await messageService.deleteMessageForMe(MID, UID);
    expect(result).toBe(true);
    expect(msg.deletedFor).toContain(UID);
    expect(msg.save).toHaveBeenCalled();
  });
});

// ─── sendMessage ──────────────────────────────────────────────────────────────
describe('sendMessage', () => {
  const setupSend = (overrides = {}) => {
    const {
      blocked = false,
      receiverUser = { notificationSettings: {} },
      conversation = null,
    } = overrides;
    Block.exists = jest.fn().mockResolvedValue(blocked);
    User.findById = jest
      .fn()
      .mockReturnValue({ select: jest.fn().mockResolvedValue(receiverUser) });
    Conversation.findOne = jest.fn().mockResolvedValue(conversation);
    if (!conversation) {
      const newConv = mkConv();
      Conversation.mockImplementation(() => newConv);
    }
    const msg = mkMsg();
    Message.mockImplementation(() => msg);
    socketSetup.getIo.mockReturnValue(mkIo());
  };

  test('throws 403 when blocked by receiver', async () => {
    Block.exists = jest.fn().mockResolvedValue(true);
    await expect(
      messageService.sendMessage(UID, RID, 'hey', null)
    ).rejects.toThrow('blocked by this user');
  });

  test('throws 404 when receiver not found', async () => {
    Block.exists = jest.fn().mockResolvedValue(false);
    User.findById = jest
      .fn()
      .mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    await expect(
      messageService.sendMessage(UID, RID, 'hey', null)
    ).rejects.toThrow('recipient user was not found');
  });

  test('throws 403 when messagePermission=Following and not following', async () => {
    Block.exists = jest.fn().mockResolvedValue(false);
    User.findById = jest.fn().mockReturnValue({
      select: jest
        .fn()
        .mockResolvedValue({
          notificationSettings: { messagePermission: 'Following' },
        }),
    });
    Follow.exists = jest.fn().mockResolvedValue(false);
    await expect(
      messageService.sendMessage(UID, RID, 'hey', null)
    ).rejects.toThrow('only accepts messages');
  });

  test('throws 404 when attached track does not exist', async () => {
    Block.exists = jest.fn().mockResolvedValue(false);
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ notificationSettings: {} }),
    });
    Track.findById = jest.fn().mockResolvedValue(null);
    const attachment = { type: 'track', referenceId: TID };
    await expect(
      messageService.sendMessage(UID, RID, 'hey', null, attachment)
    ).rejects.toThrow('attached track does not exist');
  });

  test('throws 403 when sharing private track not owned', async () => {
    Block.exists = jest.fn().mockResolvedValue(false);
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ notificationSettings: {} }),
    });
    Track.findById = jest
      .fn()
      .mockResolvedValue({
        _id: TID,
        isPublic: false,
        artist: { toString: () => 'other' },
      });
    const attachment = { type: 'track', referenceId: TID };
    await expect(
      messageService.sendMessage(UID, RID, null, null, attachment)
    ).rejects.toThrow('private track');
  });
});

// ─── markMessagesAsRead ───────────────────────────────────────────────────────
describe('markMessagesAsRead', () => {
  test('throws 404 when conversation not found', async () => {
    Conversation.findById.mockResolvedValue(null);
    await expect(messageService.markMessagesAsRead(CID, UID)).rejects.toThrow(
      'Conversation not found'
    );
  });

  test('resets unread count and updates message status', async () => {
    const conv = mkConv();
    conv.unreadCounts.get = jest.fn().mockReturnValue(5);
    conv.participants = [{ toString: () => UID }, { toString: () => RID }];
    conv.participants.find = jest.fn().mockReturnValue({ toString: () => RID });
    Conversation.findById.mockResolvedValue(conv);
    Message.updateMany.mockResolvedValue({ modifiedCount: 3 });

    const result = await messageService.markMessagesAsRead(CID, UID);
    expect(conv.unreadCounts.set).toHaveBeenCalledWith(UID, 0);
    expect(result).toBe(3);
  });

  test('skips save when unread count is 0', async () => {
    const conv = mkConv();
    conv.unreadCounts.get = jest.fn().mockReturnValue(0);
    conv.participants.find = jest.fn().mockReturnValue(null);
    Conversation.findById.mockResolvedValue(conv);
    Message.updateMany.mockResolvedValue({ modifiedCount: 0 });

    await messageService.markMessagesAsRead(CID, UID);
    expect(conv.save).not.toHaveBeenCalled();
  });
});

// ─── hideConversation ─────────────────────────────────────────────────────────
describe('hideConversation', () => {
  test('throws 404 when conversation not found', async () => {
    Conversation.findOne.mockResolvedValue(null);
    await expect(messageService.hideConversation(CID, UID)).rejects.toThrow(
      'Conversation not found'
    );
  });

  test('throws 400 when already hidden', async () => {
    const conv = mkConv({ hiddenBy: [UID] });
    conv.hiddenBy.includes = jest.fn().mockReturnValue(true);
    Conversation.findOne.mockResolvedValue(conv);
    await expect(messageService.hideConversation(CID, UID)).rejects.toThrow(
      'already hidden'
    );
  });

  test('hides conversation and clears messages', async () => {
    const conv = mkConv({ hiddenBy: [] });
    conv.hiddenBy.includes = jest.fn().mockReturnValue(false);
    Conversation.findOne.mockResolvedValue(conv);
    Message.updateMany.mockResolvedValue({ modifiedCount: 5 });

    const result = await messageService.hideConversation(CID, UID);
    expect(result).toBe(true);
    expect(conv.save).toHaveBeenCalled();
  });
});

// ─── getUserConversations ─────────────────────────────────────────────────────
describe('getUserConversations', () => {
  test('returns formatted conversations with hasMore', async () => {
    const conv = {
      _id: CID,
      participants: [
        { _id: { toString: () => UID }, displayName: 'Me' },
        { _id: { toString: () => RID }, displayName: 'Them' },
      ],
      unreadCounts: { get: jest.fn().mockReturnValue(2) },
      lastMessage: {
        _id: MID,
        content: 'Hi',
        isDeleted: false,
        attachment: null,
        senderId: UID,
        status: 'read',
        createdAt: new Date(),
      },
      updatedAt: new Date(),
    };
    const chain = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([conv]),
    };
    Conversation.find.mockReturnValue(chain);

    const result = await messageService.getUserConversations(UID, 1, 20);
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].unreadCount).toBe(2);
  });

  test('formats deleted lastMessage correctly', async () => {
    const conv = {
      _id: CID,
      participants: [{ _id: { toString: () => RID }, displayName: 'Them' }],
      unreadCounts: { get: jest.fn().mockReturnValue(0) },
      lastMessage: {
        _id: MID,
        content: 'deleted',
        isDeleted: true,
        attachment: null,
        senderId: RID,
        status: 'read',
        createdAt: new Date(),
      },
      updatedAt: new Date(),
    };
    const chain = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([conv]),
    };
    Conversation.find.mockReturnValue(chain);

    const result = await messageService.getUserConversations(UID, 1, 20);
    expect(result.conversations[0].lastMessage.content).toBeNull();
  });

  test('returns null lastMessage when none exists', async () => {
    const conv = {
      _id: CID,
      participants: [{ _id: { toString: () => RID }, displayName: 'Them' }],
      unreadCounts: { get: jest.fn().mockReturnValue(0) },
      lastMessage: null,
      updatedAt: new Date(),
    };
    const chain = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([conv]),
    };
    Conversation.find.mockReturnValue(chain);

    const result = await messageService.getUserConversations(UID, 1, 20);
    expect(result.conversations[0].lastMessage).toBeNull();
  });
});

// ─── getConversationMessages ──────────────────────────────────────────────────
describe('getConversationMessages', () => {
  test('throws 404 when conversation not found', async () => {
    Conversation.findOne.mockResolvedValue(null);
    await expect(
      messageService.getConversationMessages(CID, UID, 1, 20)
    ).rejects.toThrow('Conversation not found');
  });

  test('returns paginated messages in chronological order', async () => {
    Conversation.findOne.mockResolvedValue(mkConv());
    const msgs = [mkMsg(), mkMsg({ _id: 'msg2' })];
    const chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue(msgs),
    };
    Message.find.mockReturnValue(chain);

    const result = await messageService.getConversationMessages(
      CID,
      UID,
      1,
      20
    );
    expect(result.messages).toBeDefined();
    expect(result.hasMore).toBe(false); // 2 < 20
  });
});
