const mongoose = require('mongoose');

const playerStateSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Player state must belong to a user'],
      unique: true,
    },
    currentTrack: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Track',
      default: null,
    },
    currentTime: {
      type: Number,
      default: 0,
    },
    isPlaying: {
      type: Boolean,
      default: false,
    },
    queueContext: {
      type: String,
      enum: ['none', 'feed', 'playlist', 'track', 'station', 'search'],
      default: 'none',
    },
    contextId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlayerState', playerStateSchema);
