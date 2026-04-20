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
      default: null,
    },
    // Which playlist this track was played from (null = standalone)
    playlist: {
      type: mongoose.Schema.ObjectId,
      ref: 'Playlist',
      default: null,
    },
    // Type of history record
    type: {
      type: String,
      enum: ['track', 'playlist'],
      required: true,
      default: 'track',
    },
    progress: {
      type: Number,
      default: 0,
      description:
        'Playback progress in seconds (only relevant for track type)',
    },
    isPlayCounted: {
      type: Boolean,
      default: false,
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

// For track history: one record per user+track
listenHistorySchema.index({ user: 1, track: 1, type: 1 }, { sparse: true });

// For playlist history: one record per user+playlist
listenHistorySchema.index({ user: 1, playlist: 1, type: 1 }, { sparse: true });

// For sorting by most recent
listenHistorySchema.index({ user: 1, playedAt: -1 });

const ListenHistory = mongoose.model('ListenHistory', listenHistorySchema);
module.exports = ListenHistory;
