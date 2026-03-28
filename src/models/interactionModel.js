const mongoose = require('mongoose');

const interactionSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Track',
      required: true,
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

// Prevent duplicate likes or reposts by the same user on the same track
interactionSchema.index(
  { actorId: 1, targetId: 1, actionType: 1 },
  { unique: true }
);

// Optimize querying a track's likers/reposters, or a user's feed
interactionSchema.index({ targetId: 1, actionType: 1 });
interactionSchema.index({ actorId: 1, actionType: 1 });

const Interaction = mongoose.model('Interaction', interactionSchema);

module.exports = Interaction;
