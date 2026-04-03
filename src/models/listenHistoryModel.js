const mongoose = require('mongoose');

const listenHistorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'A listen history record must belong to a user'],
      index: true,
    },
    track: {
      type: mongoose.Schema.ObjectId,
      ref: 'Track',
      required: [true, 'A listen history record must belong to a track'],
    },
    progress: {
      type: Number,
      default: 0,
      description: 'Playback progress in seconds',
    },
    isPlayCounted: {
      type: Boolean,
      default: false,
      description:
        'Prevents multiple play count increments for a single listen',
    },
    playedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index to quickly find a specific user's history in chronological order
listenHistorySchema.index({ user: 1, playedAt: -1 });

const ListenHistory = mongoose.model('ListenHistory', listenHistorySchema);

module.exports = ListenHistory;
