// src/controllers/messageController.js
const messageService = require('../services/messageService');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

exports.sendMessage = catchAsync(async (req, res, next) => {
  const senderId = req.user._id;
  const { receiverId, content, attachmentType, attachmentId } = req.body;

  if (senderId.toString() === receiverId.toString()) {
    return next(new AppError('You cannot send a message to yourself.', 400));
  }

  // Validate that at least text OR an attachment is sent
  if (!content && !attachmentType) {
    return next(
      new AppError(
        'Message must contain either text or a track/playlist attachment.',
        400
      )
    );
  }

  // Format the attachment for the In-Chat Preview requirement
  let attachment = null;
  if (attachmentType && attachmentId) {
    attachment = {
      type: attachmentType,
      referenceId: attachmentId,
    };
  }

  // Get the global io instance attached to the app in server.js
  // const io = req.app.get('io');

  // Call the service (which handles Block checking, DB saving, and WebSocket emitting)
  const message = await messageService.sendMessage(
    senderId,
    receiverId,
    content,
    null,
    attachment
  );

  res.status(201).json({
    success: true,
    data: { message },
  });
});

exports.getUserConversations = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;

  const data = await messageService.getUserConversations(userId, page, limit);

  res.status(200).json({
    success: true,
    data: {
      conversations: data.conversations,
      page,
      hasMore: data.hasMore,
    },
  });
});

exports.getConversationMessages = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const userId = req.user._id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;

  const data = await messageService.getConversationMessages(
    conversationId,
    userId,
    page,
    limit
  );

  res.status(200).json({
    success: true,
    data: {
      messages: data.messages,
      page,
      hasMore: data.hasMore,
    },
  });
});

exports.hideConversation = catchAsync(async (req, res, next) => {
  // Pass the data to the service layer
  await messageService.hideConversation(
    req.params.conversationId,
    req.user._id
  );

  res.status(200).json({
    success: true,
    message:
      'Conversation removed from inbox and history cleared successfully.',
  });
});

exports.editMessage = catchAsync(async (req, res, next) => {
  const message = await messageService.editMessage(
    req.params.messageId,
    req.user._id,
    req.body.content
  );

  res.status(200).json({
    success: true,
    data: { message },
  });
});

exports.deleteMessageForEveryone = catchAsync(async (req, res, next) => {
  const message = await messageService.deleteMessageForEveryone(
    req.params.messageId,
    req.user._id
  );

  res.status(200).json({
    success: true,
    message: 'Message deleted for everyone.',
    data: { message },
  });
});

exports.deleteMessageForMe = catchAsync(async (req, res, next) => {
  await messageService.deleteMessageForMe(req.params.messageId, req.user._id);

  res.status(200).json({
    success: true,
    message: 'Message deleted for you.',
  });
});

exports.markAsRead = catchAsync(async (req, res, next) => {
  const modifiedCount = await messageService.markMessagesAsRead(
    req.params.conversationId,
    req.user._id
  );

  if (modifiedCount === 0) {
    return res.status(200).json({
      success: true,
      message: 'All messages were already read.',
      updatedCount: 0,
    });
  }

  res.status(200).json({
    success: true,
    message: `Successfully marked ${modifiedCount} messages as read.`,
    updatedCount: modifiedCount,
  });
});
