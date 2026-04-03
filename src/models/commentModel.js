const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A comment must belong to a user']
    },
    track: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Track',
      required: [true, 'A comment must belong to a track']
    },
    content: {
      type: String,
      required: [true, 'Comment content cannot be empty'],
      trim: true,
      maxlength: [1000, 'Comment cannot exceed 1000 characters']
    },
    timestamp: {
      type: Number,
      required: [true, 'A track timestamp (in seconds) is required for the comment'],
      min: [0, 'Timestamp cannot be negative']
    },
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for fast retrieval of a track's comments, sorted by timestamp on the waveform
commentSchema.index({ track: 1, timestamp: 1 });

// Virtual populate for 1-level deep replies
commentSchema.virtual('replies', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'parentComment'
});

const Comment = mongoose.model('Comment', commentSchema);
module.exports = Comment;