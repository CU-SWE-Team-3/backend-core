const mongoose = require('mongoose');

const interactionSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // ==========================================
    // POLYMORPHIC REFERENCES (The Fix)
    // ==========================================
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'targetModel', // Mongoose looks at the field below to know which collection to search!
    },
    targetModel: {
      type: String,
      required: true,
      enum: ['Track', 'Playlist', 'Album'], // Must match your exact Model names
      default: 'Track',
    },
    actionType: {
      type: String,
      enum: ['LIKE', 'REPOST'],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate likes or reposts by the same user on the same entity
// (Added targetModel to the unique index to be completely safe)
interactionSchema.index(
  { actorId: 1, targetId: 1, targetModel: 1, actionType: 1 },
  { unique: true }
);

// Optimize querying a track/playlist's likers/reposters
interactionSchema.index({ targetId: 1, targetModel: 1, actionType: 1 });

// Optimize querying a user's likes/reposts feed
interactionSchema.index({ actorId: 1, actionType: 1 });

const Interaction = mongoose.model('Interaction', interactionSchema);

module.exports = Interaction;
