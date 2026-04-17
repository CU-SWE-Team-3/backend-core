// src/models/reportModel.js
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    targetType: {
      type: String,
      enum: ['Track', 'Comment', 'User'],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'targetType', // Dynamic reference based on targetType
    },
    reason: {
      type: String,
      enum: ['Copyright', 'Inappropriate Content', 'Spam', 'Other'],
      required: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Reviewed', 'Resolved'],
      default: 'Pending',
    },
  },
  { timestamps: true }
);

const Report = mongoose.model('Report', reportSchema);
module.exports = Report;
