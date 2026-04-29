// src/models/notificationModel.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Keep this capped at ~3 users in the service layer
    actors: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    // Tracks the total number of people so we don't blow up the 'actors' array
    actorCount: {
      type: Number,
      default: 1,
    },
    type: {
      type: String,
      enum: [
        'LIKE',
        'REPOST',
        'COMMENT',
        'FOLLOW',
        'MESSAGE',
        'NEW_TRACK',
        'NEW_PLAYLIST',
        'MENTION',
        'SYSTEM',
        'RECOMMENDED',
      ],
      required: true,
    },
    target: {
      type: mongoose.Schema.Types.ObjectId,
      // Target is required for everything EXCEPT system broadcasts
      required: function () {
        return this.type !== 'SYSTEM';
      },
      refPath: 'targetModel',
    },
    targetModel: {
      type: String,
      // TargetModel is required for everything EXCEPT system broadcasts
      required: function () {
        return this.type !== 'SYSTEM';
      },
      enum: ['Track', 'Playlist', 'User', 'Comment', 'Message', 'Album'],
    },
    contentSnippet: {
      type: String,
      maxlength: 100,
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    actionLink: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ==========================================
// DATABASE INDEXES
// ==========================================

// 1. Compound index to quickly find existing notifications for aggregation
notificationSchema.index({ recipient: 1, target: 1, type: 1, isRead: 1 });

// 2. Makes fetching unread notifications lightning fast
notificationSchema.index({ recipient: 1, isRead: 1 });

// 3. Fast sorting for the chronological feed
notificationSchema.index({ recipient: 1, updatedAt: -1 });

// 4. TTL (Time-To-Live) Index: Auto-delete notifications after 30 days
// 30 days = 2,592,000 seconds
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

// ==========================================
// MODEL COMPILATION
// (Must happen AFTER indexes are defined)
// ==========================================
const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
