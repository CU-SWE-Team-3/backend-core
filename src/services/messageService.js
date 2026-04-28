// src/services/messageService.js
const Conversation = require('../models/conversationModel');
const Message = require('../models/messageModel');
const Block = require('../models/blockModel');
const Track = require('../models/trackModel');
const AppError = require('../utils/appError');
const { getIo, connectedUsers } = require('../sockets/socketSetup');
const notificationService = require('./notificationService');

const TIME_LIMIT_MS = 15 * 60 * 1000; // 15 Minutes

const checkIfUserActiveInRoom = (userId, conversationId) => {
  try {
    const io = getIo();

    // 1. Get the user's current socket ID
    const socketId = connectedUsers.get(userId.toString());

    // If they have no socket ID, they are completely offline
    if (!socketId) return false;

    // 2. Look at the specific conversation room
    const roomName = `chat_${conversationId}`;
    const room = io.sockets.adapter.rooms.get(roomName);

    // 3. Check if their socket ID is inside that room
    if (room && room.has(socketId)) {
      return true; // They are online AND looking at this exact chat!
    }

    return false; // They are online, but looking at a different screen/chat
  } catch (error) {
    console.error('Error checking room activity:', error);
    return false;
  }
};

exports.editMessage = async (messageId, userId, content) => {
  const message = await Message.findById(messageId);
  if (!message) throw new AppError('Message not found.', 404);

  if (message.senderId.toString() !== userId.toString()) {
    throw new AppError('You can only edit your own messages.', 403);
  }
  if (message.isDeleted) {
    throw new AppError('Cannot edit a deleted message.', 400);
  }

  const timePassed = Date.now() - new Date(message.createdAt).getTime();
  if (timePassed > TIME_LIMIT_MS) {
    throw new AppError(
      'You can only edit messages within 15 minutes of sending.',
      403
    );
  }

  message.content = content;
  message.isEdited = true;
  await message.save();

  // Socket Logic
  const conversation = await Conversation.findById(message.conversationId);
  const receiverId = conversation.participants.find(
    (p) => p.toString() !== userId.toString()
  );

  if (receiverId) {
    const io = getIo();
    const receiverSocketId = connectedUsers.get(receiverId.toString());
    if (receiverSocketId)
      io.to(receiverSocketId).emit('message_edited', message);
  }

  return message;
};

exports.deleteMessageForEveryone = async (messageId, userId) => {
  const message = await Message.findById(messageId);
  if (!message) throw new AppError('Message not found.', 404);

  if (message.senderId.toString() !== userId.toString()) {
    throw new AppError('You can only unsend your own messages.', 403);
  }

  if (message.isDeleted) {
    throw new AppError('This message has already been deleted.', 400);
  }

  const timePassed = Date.now() - new Date(message.createdAt).getTime();
  if (timePassed > TIME_LIMIT_MS) {
    throw new AppError(
      'You can only delete messages for everyone within 15 minutes.',
      403
    );
  }

  message.content = 'This message was deleted';
  message.attachment = null;
  message.isDeleted = true;
  await message.save();

  // Socket Logic
  const conversation = await Conversation.findById(message.conversationId);
  const receiverId = conversation.participants.find(
    (p) => p.toString() !== userId.toString()
  );

  if (receiverId) {
    const io = getIo();
    const receiverSocketId = connectedUsers.get(receiverId.toString());
    if (receiverSocketId)
      io.to(receiverSocketId).emit('message_deleted_everyone', message);
  }

  return message;
};

exports.deleteMessageForMe = async (messageId, userId) => {
  const message = await Message.findById(messageId);
  if (!message) throw new AppError('Message not found.', 404);

  // 1. Check if they already deleted it (Idempotency)
  if (message.deletedFor.includes(userId)) {
    throw new AppError('You have already deleted this message.', 400);
  }

  // 2. If the code reaches here, we know for a fact they aren't in the array yet.
  // So we just push and save!
  message.deletedFor.push(userId);
  await message.save();

  return true;
};

exports.sendMessage = async (
  senderId,
  receiverId,
  content,
  _io,
  attachment = null
) => {
  // 1. CORRECTED: Check Status / Blocking Rules using your Block collection
  const isBlocked = await Block.exists({
    blocker: receiverId,
    blocked: senderId,
  });
  if (isBlocked) {
    throw new AppError(
      'Cannot send message. You are blocked by this user.',
      403
    );
  }

  //PRIVATE TRACK CHECK GOES HERE
  if (attachment && attachment.type === 'track') {
    const trackToShare = await Track.findById(attachment.referenceId);
    if (!trackToShare) {
      throw new AppError('The attached track does not exist.', 404);
    }

    if (
      trackToShare.isPublic === false &&
      trackToShare.artist.toString() !== senderId.toString()
    ) {
      throw new AppError(
        'You cannot share a private track you do not own.',
        403
      );
    }
  }

  // 2. Find or create conversation
  let conversation = await Conversation.findOne({
    participants: { $all: [senderId, receiverId] },
  });

  if (!conversation) {
    conversation = new Conversation({
      participants: [senderId, receiverId],
      unreadCounts: { [senderId]: 0, [receiverId]: 0 },
    });
  }

  conversation.hiddenBy = [];

  // 3. Create the message
  const newMessage = new Message({
    conversationId: conversation._id,
    senderId,
    content,
    attachment,
  });
  await newMessage.save();

  // 4. Update conversation: set last message & increment unread count for receiver
  const currentUnread =
    conversation.unreadCounts.get(receiverId.toString()) || 0;
  conversation.unreadCounts.set(receiverId.toString(), currentUnread + 1);
  conversation.lastMessage = newMessage._id;
  conversation.markModified('unreadCounts');
  await conversation.save();
  // 5. Emit real-time WebSocket event IF the receiver is online
  const io = getIo();

  const receiverSocketId = connectedUsers.get(receiverId.toString());
  if (receiverSocketId) {
    io.to(receiverSocketId).emit('receive_message', newMessage);

    newMessage.status = 'delivered';
    await newMessage.save();
  }

  // ==========================================
  // MODULE 10: NOTIFICATION TRIGGER
  // ==========================================
  // We determine what text to show in the notification dropdown.
  // If they sent text, show it. If they sent a track/playlist, say so!
  let notificationText = content;
  if (!notificationText && attachment) {
    notificationText = `Shared a ${attachment.type} with you`;
  }

  const isUserBInChat = checkIfUserActiveInRoom(receiverId, conversation._id);

  // CORRECTED: Added the closing bracket for this if statement
  if (!isUserBInChat) {
    // Only fire push notification if they are NOT looking at the chat
    notificationService.notifyMessage(
      receiverId,
      senderId,
      newMessage._id,
      notificationText
    );
  } //

  return {
    _id: newMessage._id,
    conversationId: newMessage.conversationId,
    senderId: newMessage.senderId,
    content: newMessage.content,
    attachment: newMessage.attachment,
    status: newMessage.status,
    createdAt: newMessage.createdAt,
    updatedAt: newMessage.updatedAt,
  };
};

exports.markMessagesAsRead = async (conversationId, userId) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new AppError('Conversation not found.', 404);

  // 1. Reset the user's unread count to 0
  if (conversation.unreadCounts.get(userId.toString()) > 0) {
    conversation.unreadCounts.set(userId.toString(), 0);
    await conversation.save();
  }

  // 2. Find all 'delivered' messages sent by the OTHER person, and mark as 'read'
  const result = await Message.updateMany(
    {
      conversationId: conversationId,
      senderId: { $ne: userId }, // We only mark messages sent TO us as read
      status: { $ne: 'read' },
    },
    {
      $set: { status: 'read' },
    }
  );

  // 3. Emit real-time "Read Receipt" so the sender sees the blue ticks instantly
  const otherParticipantId = conversation.participants.find(
    (p) => p.toString() !== userId.toString()
  );

  if (otherParticipantId && result.modifiedCount > 0) {
    const io = getIo();
    const otherSocketId = connectedUsers.get(otherParticipantId.toString());
    if (otherSocketId) {
      io.to(otherSocketId).emit('messages_read', { conversationId });
    }
  }

  return result.modifiedCount;
};

exports.hideConversation = async (conversationId, userId) => {
  // 1. Find the conversation
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: userId,
  });

  if (!conversation) {
    throw new AppError('Conversation not found or access denied.', 404);
  }

  // 2. Check if they already hid it (Idempotency)
  if (conversation.hiddenBy.includes(userId)) {
    throw new AppError('This conversation is already hidden.', 400);
  }

  // 3. If we reach here, it is NOT hidden yet. Hide it visually!
  conversation.hiddenBy.push(userId);
  await conversation.save();

  // 4. Clear the history for this user
  // Pushes the user's ID into the 'deletedFor' array of ALL existing messages in this chat.
  await Message.updateMany(
    { conversationId: conversationId },
    { $addToSet: { deletedFor: userId } }
  );

  return true;
};
exports.getUserConversations = async (userId, page, limit) => {
  const skip = (page - 1) * limit;

  const conversations = await Conversation.find({
    participants: userId,
    hiddenBy: { $ne: userId },
  })
    .populate('participants', 'displayName permalink avatarUrl role')
    .populate({
      path: 'lastMessage',
      populate: {
        path: 'attachment.referenceId',
        select: 'title', // ONLY fetch the title for the inbox preview to keep it fast!
      },
    })
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit);

  const formattedConversations = conversations.map((conv) => {
    const unreadCount = conv.unreadCounts.get(userId.toString()) || 0;
    const lm = conv.lastMessage;
    return {
      _id: conv._id,
      participants: conv.participants.filter(
        (p) => p._id.toString() !== userId.toString()
      ),
      lastMessage: lm
        ? {
            _id: lm._id,
            content: lm.isDeleted ? null : lm.content,
            attachment: lm.isDeleted ? null : lm.attachment,
            senderId: lm.senderId,
            status: lm.status,
            isDeleted: lm.isDeleted,
            createdAt: lm.createdAt,
          }
        : null,
      unreadCount,
      updatedAt: conv.updatedAt,
    };
  });

  return {
    conversations: formattedConversations,
    hasMore: conversations.length === limit,
  };
};

exports.getConversationMessages = async (
  conversationId,
  userId,
  page,
  limit
) => {
  // Ensure user is part of the conversation
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: userId,
  });

  if (!conversation) {
    throw new AppError('Conversation not found or access denied.', 404);
  }

  const skip = (page - 1) * limit;

  // Fetch paginated messages
  const messages = await Message.find({
    conversationId,
    deletedFor: { $ne: userId },
  })
    .sort({ createdAt: -1 }) // Get newest first
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'attachment.referenceId',
      select: 'title artworkUrl permalink duration waveform trackCount',
    });

  return {
    // Reverse array to return chronological order for the frontend UI
    messages: messages.reverse(),
    hasMore: messages.length === limit,
  };
};
