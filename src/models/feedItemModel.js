const mongoose = require('mongoose');

const feedItemSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  actorId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  activityType: {
    type: String,
    enum: ['TRACK_UPLOAD', 'LIKE', 'REPOST'],
    required: true,
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'targetModel', // Mongoose looks at this field to know which DB collection to populate from!
  },
  targetModel: {
    type: String,
    required: true,
    enum: ['Track', 'Playlist', 'Album'],
  },
  activityDate: {
    type: Date,
    default: Date.now,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: '30d', // MongoDB will automatically delete this document after 30 days
  },
});

feedItemSchema.index({ ownerId: 1, activityDate: -1 });

const FeedItem = mongoose.model('FeedItem', feedItemSchema);
module.exports = FeedItem;
