const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    // Tracks unread counts per user. E.g., { "userId1": 2, "userId2": 0 }
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    hiddenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { timestamps: true }
);

// Ensure fast lookups for user conversations
conversationSchema.index({ participants: 1 });

module.exports = mongoose.model('Conversation', conversationSchema);
