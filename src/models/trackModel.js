const mongoose = require('mongoose');

const slug = require('mongoose-slug-updater');

mongoose.plugin(slug);

const trackSchema = new mongoose.Schema(
  {
    // ==========================================
    // BE-3: METADATA ENGINE & VISUALS
    // ==========================================
    title: {
      type: String,
      required: [true, 'A track must have a title'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    permalink: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      slug: 'title', // <--- 3. THIS IS THE MAGIC LINE!
      slugPaddingSize: 1,
      index: true, // Add an index for faster lookups by permalink
    },
    artist: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'A track must belong to an artist (user)'],
    },
    description: {
      type: String,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      trim: true,
    },
    genre: {
      type: String,
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    releaseDate: {
      type: Date,
      default: Date.now,
    },
    artworkUrl: {
      type: String,
      default: 'default-track-artwork.png', // Will be replaced by your Azure Blob URL
    },

    // ==========================================
    // BE-3: TRACK VISIBILITY
    // ==========================================
    isPublic: {
      type: Boolean,
      default: true, // true = Public (searchable), false = Private (link-only)
    },

    // ==========================================
    // BE-2: AUDIO PIPELINE (Placeholders)
    // ==========================================
    // --- BE-2 CORE AUDIO INFRASTRUCTURE (Your Domain) ---
    audioUrl: {
      type: String,
      // Not required upon immediate creation because it takes time to process/upload to cloud
    },
    hlsUrl: {
      type: String,
      // This will store the link to the playlist.m3u8 file on Azure
    },
    waveform: {
      type: [Number], // Array of numbers representing the audio peaks
      default: [],
    },
    format: {
      type: String,
      required: [true, 'Audio format (MIME type) is required'],
    },
    size: {
      type: Number,
      required: [true, 'File size in bytes is required for storage tracking'],
    },
    duration: {
      type: Number,
      // Will be populated once we extract metadata via fluent-ffmpeg or music-metadata
    },
    processingState: {
      type: String,
      enum: ['Processing', 'Finished', 'Failed'],
      default: 'Processing',
    },

    // --- METRICS (Updated dynamically via Module 3 actions) ---
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
    commentCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// --- PERFORMANCE INDEXES ---
// These ensure fast lookups for the Feed, Profile pages, and Transcoding queue
trackSchema.index({ artist: 1 });
trackSchema.index({ processingState: 1 });
trackSchema.index({ createdAt: -1 }); // Crucial for chronological feed sorting

const Track = mongoose.model('Track', trackSchema);

module.exports = Track;
