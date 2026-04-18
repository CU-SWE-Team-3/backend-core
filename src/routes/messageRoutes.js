// src/routes/messageRoutes.js
const express = require('express');
const messageController = require('../controllers/messageController');
const { protect } = require('../middlewares/authMiddleware');
const { validate } = require('../validations/validationMiddleware');
const {
  sendMessageSchema,
  getMessagesSchema,
  hideConversationSchema,
  editMessageSchema,
  deleteMessageSchema,
  markAsReadSchema,
} = require('../validations/messageValidation');

const router = express.Router();

// All messaging routes require the user to be logged in
router.use(protect);

// 1. Get all active conversations (Inbox view)
router.get('/conversations', messageController.getUserConversations);
// 2. Send a new message or Track Share
router.post('/', validate(sendMessageSchema), messageController.sendMessage);

// 3. Get message history for a specific conversation
router.get(
  '/:conversationId/messages',
  validate(getMessagesSchema),
  messageController.getConversationMessages
);

// 4. Hide a conversation from the inbox
router.delete(
  '/conversations/:conversationId',
  validate(hideConversationSchema),
  messageController.hideConversation
);

// 5. Edit a specific message
router.patch(
  '/:messageId',
  validate(editMessageSchema),
  messageController.editMessage
);

// 6. Delete for Everyone (Unsend)
router.delete(
  '/:messageId/everyone',
  validate(deleteMessageSchema),
  messageController.deleteMessageForEveryone
);

// 7. Delete for Me (Hide specific message)
router.delete(
  '/:messageId/me',
  validate(deleteMessageSchema),
  messageController.deleteMessageForMe
);

router.patch(
  '/conversations/:conversationId/read',
  validate(markAsReadSchema),
  messageController.markAsRead
);

module.exports = router;
