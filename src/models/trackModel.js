const mongoose = require('mongoose');

const slug = require('mongoose-slug-updater');

mongoose.plugin(slug);

const validGenres = [
  'All music genres',
  'Alternative Rock',
  'Ambient',
  'Classical',
  'Country',
  'Dance & EDM',
  'Deep house',
  'Drum & Bass',
  'Electronic',
  'Hiphop & rap',
  'House',
  'Indie',
  'Jazz & blues',
  'Latin',
  'Metal',
  'Pop',
  'R&B & soul',
  'Reggae',
  'Rock',
  'Soundtrack',
  'Techno',
  'Trance',
  'Trap',
  'Arabic',
  'Islamic',
];

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
      enum: {
        values: validGenres,
        message: 'Please select a valid genre',
      },
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

    moderationStatus: {
      type: String,
      enum: ['Approved', 'Hidden_By_Admin'],
      default: 'Approved', // Controlled ONLY by Admins
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
    isrc: {
      type: String,
      trim: true,
      maxlength: [20, 'ISRC cannot exceed 20 characters'],
    },
    iswc: {
      type: String,
      trim: true,
      maxlength: [20, 'ISWC cannot exceed 20 characters'],
    },
    composer: {
      type: String,
      trim: true,
      maxlength: [100, 'Composer cannot exceed 100 characters'],
    },
    publisher: {
      type: String,
      trim: true,
      maxlength: [100, 'Publisher cannot exceed 100 characters'],
    },
    releaseTitle: {
      type: String,
      trim: true,
      maxlength: [100, 'Release title cannot exceed 100 characters'],
    },
    albumTitle: {
      type: String,
      trim: true,
      maxlength: [100, 'Album title cannot exceed 100 characters'],
    },
    recordLabel: {
      type: String,
      trim: true,
      maxlength: [100, 'Record label cannot exceed 100 characters'],
    },
    barcode: {
      type: String,
      trim: true,
      maxlength: [50, 'Barcode cannot exceed 50 characters'],
    },
    pLine: {
      type: String,
      trim: true,
      maxlength: [100, 'P line cannot exceed 100 characters'],
    },
    license: {
      type: String,
      enum: ['All Rights Reserved', 'Creative Commons'],
      default: 'All Rights Reserved',
    },
    containsExplicitContent: {
      type: Boolean,
      default: false,
    },
    buyLink: {
      type: String,
      trim: true,
      maxlength: [500, 'Buy link cannot exceed 500 characters'],
    },
    // Permissions tab
    allowComments: {
      type: Boolean,
      default: true,
    },
    displayStatsPublicly: {
      type: Boolean,
      default: true,
    },
    enableDirectDownloads: {
      type: Boolean,
      default: false,
    },
    enableContentId: {
      type: Boolean,
      default: false,
    },
    includeInRssFeed: {
      type: Boolean,
      default: true,
    },
    // Advanced tab — audio clip preview
    previewStartTime: {
      type: Number,
      default: 0,
      min: [0, 'Preview start time cannot be negative'],
    },
    previewEndTime: {
      type: Number,
      default: 20,
      min: [0, 'Preview end time cannot be negative'],
    },
    isPromoted: {
      type: Boolean,
      default: false,
    },
    viralScore: {
      type: Number,
      default: 0,
      index: true,
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
trackSchema.index({ genre: 1, viralScore: -1 });
trackSchema.index({ viralScore: -1 });

trackSchema.index(
  { title: 'text', tags: 'text' },
  { weights: { title: 5, tags: 2 }, name: 'TrackTextIndex' }
);

trackSchema.index({
  isPublic: 1,
  moderationStatus: 1,
  processingState: 1,
  viralScore: -1,
});

const Track = mongoose.model('Track', trackSchema);

module.exports = Track;
