exports.sendMessageSchema = {
  body: {
    receiverId: {
      required: true,
      type: 'mongoId',
      requiredMessage: 'Receiver ID is required to send a message.',
    },
    content: {
      required: false, // Optional if sending ONLY an attachment
      type: 'string',
      maxLength: 2000,
      maxLengthMessage: 'Message cannot exceed 2000 characters.',
    },
    attachmentType: {
      required: false,
      type: 'string',
      enum: ['track', 'playlist'],
      enumMessage: 'Attachment type must be either track or playlist.',
    },
    attachmentId: {
      required: false,
      type: 'mongoId',
    },
  },
};

exports.getMessagesSchema = {
  params: {
    conversationId: {
      required: true,
      type: 'mongoId',
    },
  },
};

// Add this to your existing exports in src/validations/messageValidation.js
exports.hideConversationSchema = {
  params: {
    conversationId: {
      required: true,
      type: 'mongoId',
      requiredMessage: 'A valid Conversation ID is required to hide it.',
    },
  },
};

exports.editMessageSchema = {
  params: {
    messageId: {
      required: true,
      type: 'mongoId',
      requiredMessage: 'A valid Message ID is required.',
    },
  },
  body: {
    content: {
      required: true,
      type: 'string',
      maxLength: 2000,
      requiredMessage: 'Content is required to edit a message.',
      maxLengthMessage: 'Message cannot exceed 2000 characters.',
    },
  },
};

exports.deleteMessageSchema = {
  params: {
    messageId: {
      required: true,
      type: 'mongoId',
      requiredMessage: 'A valid Message ID is required.',
    },
  },
};

exports.markAsReadSchema = {
  params: {
    conversationId: {
      required: true,
      type: 'mongoId',
      requiredMessage: 'A valid Conversation ID is required.',
    },
  },
};
