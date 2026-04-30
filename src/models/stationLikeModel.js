const mongoose = require('mongoose');

const stationLikeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Station type mirrors discoveryService station IDs
    // e.g. 'genre_electronic', 'artist_<id>', 'trending_mix', 'fresh_finds', etc.
    stationId: {
      type: String,
      required: [true, 'stationId is required'],
      trim: true,
    },
    stationType: {
      type: String,
      enum: ['genre', 'artist', 'trending', 'curated', 'recommended'],
      required: true,
    },
    // Human-readable label saved at like-time so we can show it without re-fetching
    stationTitle: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    stationDescription: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    // For artist stations we store the artistId so we can hydrate tracks later
    artistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // For genre stations
    genre: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

// One like per user per station
stationLikeSchema.index({ user: 1, stationId: 1 }, { unique: true });
// Fast list query sorted newest-first
stationLikeSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('StationLike', stationLikeSchema);
