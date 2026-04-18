const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      maxLength: 2000, // Professional platforms limit message length
    },
    // In-Chat Previews (Module 9 Requirement)
    attachment: {
      type: {
        type: String,
        enum: ['track', 'playlist', null],
        default: null,
      },
      referenceId: {
        type: mongoose.Schema.Types.ObjectId, // Ref to Track or Playlist
        default: null,
      },
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false, // Used for "Delete for Everyone"
    },
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Used for "Delete for Me"
      },
    ],
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
