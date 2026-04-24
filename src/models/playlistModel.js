// src/models/playlistModel.js
const mongoose = require('mongoose');
const slugUpdater = require('mongoose-slug-updater');
const crypto = require('crypto');

mongoose.plugin(slugUpdater);

const playlistSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      maxlength: 100,
    },
    permalink: {
      type: String,
      slug: 'title',
      unique: true,
      sparse: true,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    description: {
      type: String,
      maxlength: 1000,
      default: '',
    },
    trackCount: {
      type: Number,
      default: 0,
    },
    totalDuration: {
      type: Number,
      default: 0, // Stored in seconds
    },
    releaseType: {
      type: String,
      enum: ['playlist', 'album', 'ep', 'single'],
      default: 'playlist',
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    genre: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    releaseDate: {
      type: Date,
    },
    labelName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    buyLink: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    buyTitle: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    // 👇 NEW: Industry Standard Barcode (UPC/EAN)
    upc: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    tracks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Track',
      },
    ],
    artworkUrl: {
      type: String,
      default: 'default-playlist.png',
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    secretToken: {
      type: String,
      sparse: true,
    },
    playCount: {
      type: Number,
      default: 0,
    },
    likeCount: {
      type: Number,
      default: 0,
    },
    repostCount: {
      type: Number,
      default: 0,
    },
    viralScore: {
      type: Number,
      default: 0,
      index: true, // 👈 VERY IMPORTANT for speed!
    },
  },
  {
    timestamps: true,
  }
);

playlistSchema.pre('save', function (next) {
  if (this.isPrivate && !this.secretToken) {
    this.secretToken = crypto.randomBytes(16).toString('hex');
  } else if (!this.isPrivate && this.secretToken) {
    this.secretToken = undefined;
  }
  next();
});

playlistSchema.methods.toJSON = function () {
  const playlist = this.toObject();
  delete playlist.__v;
  if (!playlist.isPrivate) {
    delete playlist.secretToken;
  }
  return playlist;
};
playlistSchema.index(
  { title: 'text', tags: 'text' },
  { weights: { title: 5, tags: 2 }, name: 'PlaylistTextIndex' }
);

const Playlist = mongoose.model('Playlist', playlistSchema);

module.exports = Playlist;
