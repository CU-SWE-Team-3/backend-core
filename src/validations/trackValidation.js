/**
 * trackValidation.js  —  Module 4: Audio Upload & Track Management
 *
 * Covers:
 *   POST   /api/tracks/upload             (initiateUpload)
 *   PATCH  /api/tracks/:id/confirm        (confirmUpload)
 *   PATCH  /api/tracks/:id/metadata       (updateMetadata)
 *   PATCH  /api/tracks/:id/visibility     (updateVisibility)
 *   PATCH  /api/tracks/:id/artwork        (handled by multer — no body schema)
 *   GET    /api/tracks/:permalink         (no body)
 *   GET    /api/tracks/:id/download       (no body)
 *   DELETE /api/tracks/:id               (no body)
 */

// ─── Shared Fragments ──────────────────────────────────────────────────────────

const ALLOWED_AUDIO_FORMATS = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
];

const ALLOWED_GENRES = [
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

const mongoIdParam = (label = 'Track ID') => ({
  required: true,
  type: 'mongoId',
  typeMessage: `${label} must be a valid MongoDB ObjectId`,
});

// ─── Schemas ───────────────────────────────────────────────────────────────────

/**
 * POST /api/tracks/upload
 * Client sends track metadata BEFORE the actual file upload (direct-to-cloud flow).
 */
const initiateUploadSchema = {
  body: {
    title: {
      required: true,
      type: 'string',
      minLength: 1,
      minLengthMessage: 'Track title cannot be empty',
      maxLength: 100,
      maxLengthMessage: 'Track title must not exceed 100 characters',
    },
    format: {
      required: true,
      type: 'string',
      enum: ALLOWED_AUDIO_FORMATS,
      enumMessage: `Audio format must be one of: ${ALLOWED_AUDIO_FORMATS.join(', ')}`,
    },
    size: {
      required: true,
      type: 'number',
      min: 1,
      minMessage: 'File size must be greater than 0 bytes',
      max: 500 * 1024 * 1024,
      maxMessage: 'File size must not exceed 500 MB',
    },
    duration: {
      required: true,
      type: 'number',
      min: 1,
      minMessage: 'Track duration must be at least 1 second',
      max: 10800,
      maxMessage: 'Track duration must not exceed 3 hours',
    },
    description: {
      required: false,
      type: 'string',
      maxLength: 1000,
      maxLengthMessage: 'Description must not exceed 1000 characters',
    },
    genre: {
      required: false,
      type: 'string',
      enum: ALLOWED_GENRES,
      enumMessage: 'Invalid genre selected.',
    },
    tags: {
      required: false,
      type: 'array',
      maxItems: 20,
      maxItemsMessage: 'You can add at most 20 tags',
      itemType: 'string',
      itemTypeMessage: 'Each tag must be a string',
      custom: (tags) => {
        if (!Array.isArray(tags)) return null;
        const hasInvalidTag = tags.some(
          (tag) => typeof tag === 'string' && tag.trim().length > 30
        );
        if (hasInvalidTag) return 'Each tag must not exceed 30 characters';
        return null;
      },
    },
    isPublic: {
      required: false,
      type: 'boolean',
      typeMessage: 'isPublic must be true (Public) or false (Private)',
    },
    releaseDate: {
      required: false,
      type: 'string',
      custom: (v) => {
        if (!v) return null;
        const d = new Date(v);
        if (Number.isNaN(d.getTime()))
          return 'releaseDate must be a valid date';
        return null;
      },
    },
    isrc: {
      required: false,
      type: 'string',
      maxLength: 20,
      maxLengthMessage: 'ISRC cannot exceed 20 characters',
    },
    iswc: {
      required: false,
      type: 'string',
      maxLength: 20,
      maxLengthMessage: 'ISWC cannot exceed 20 characters',
    },
    composer: {
      required: false,
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Composer cannot exceed 100 characters',
    },
    publisher: {
      required: false,
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Publisher cannot exceed 100 characters',
    },
    releaseTitle: {
      required: false,
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Release title cannot exceed 100 characters',
    },
    albumTitle: {
      required: false,
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Album title cannot exceed 100 characters',
    },
    recordLabel: {
      required: false,
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Record label cannot exceed 100 characters',
    },
    barcode: {
      required: false,
      type: 'string',
      maxLength: 50,
      maxLengthMessage: 'Barcode cannot exceed 50 characters',
    },
    pLine: {
      required: false,
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'P line cannot exceed 100 characters',
    },
    license: {
      required: false,
      type: 'string',
      enum: ['All Rights Reserved', 'Creative Commons'],
      enumMessage: 'License must be All Rights Reserved or Creative Commons',
    },
    containsExplicitContent: {
      required: false,
      type: 'boolean',
      typeMessage: 'containsExplicitContent must be true or false',
    },
    buyLink: {
      required: false,
      type: 'string',
      maxLength: 500,
      maxLengthMessage: 'Buy link cannot exceed 500 characters',
    },
    allowComments: {
      required: false,
      type: 'boolean',
      typeMessage: 'allowComments must be true or false',
    },
    displayStatsPublicly: {
      required: false,
      type: 'boolean',
      typeMessage: 'displayStatsPublicly must be true or false',
    },
    enableDirectDownloads: {
      required: false,
      type: 'boolean',
      typeMessage: 'enableDirectDownloads must be true or false',
    },
    enableContentId: {
      required: false,
      type: 'boolean',
      typeMessage: 'enableContentId must be true or false',
    },
    includeInRssFeed: {
      required: false,
      type: 'boolean',
      typeMessage: 'includeInRssFeed must be true or false',
    },
    previewStartTime: {
      required: false,
      type: 'number',
      min: 0,
      minMessage: 'Preview start time cannot be negative',
    },
    previewEndTime: {
      required: false,
      type: 'number',
      min: 0,
      minMessage: 'Preview end time cannot be negative',
      custom: (v) => {
        if (v === undefined || v === null) return null;
        if (v - 0 > 20)
          return 'Preview clip cannot exceed 20 seconds. Set previewStartTime accordingly.';
        return null;
      },
    },
  },
};

/**
 * PATCH /api/tracks/:id/confirm
 */
const confirmUploadSchema = {
  params: {
    id: mongoIdParam(),
  },
};

/**
 * PATCH /api/tracks/:id/metadata
 * All fields are optional — at least one must be provided (custom check).
 */
const updateMetadataSchema = {
  params: {
    id: mongoIdParam(),
  },
  body: {
    title: {
      required: false,
      type: 'string',
      minLength: 1,
      minLengthMessage: 'Title cannot be empty',
      maxLength: 100,
      maxLengthMessage: 'Title must not exceed 100 characters',
    },
    description: {
      required: false,
      type: 'string',
      maxLength: 1000,
      maxLengthMessage: 'Description must not exceed 1000 characters',
    },
    genre: {
      required: false,
      type: 'string',
      enum: ALLOWED_GENRES,
      enumMessage: 'Invalid genre selected.',
    },
    tags: {
      required: false,
      type: 'array',
      maxItems: 20,
      maxItemsMessage: 'You can add at most 20 tags',
      itemType: 'string',
      itemTypeMessage: 'Each tag must be a string',
      custom: (tags) => {
        if (!Array.isArray(tags)) return null;
        const hasInvalidTag = tags.some(
          (tag) => typeof tag === 'string' && tag.trim().length > 30
        );
        if (hasInvalidTag) {
          return 'Each tag must not exceed 30 characters';
        }
        return null;
      },
    },
    isPublic: {
      required: false,
      type: 'boolean',
      typeMessage: 'isPublic must be true (Public) or false (Private)',
    },
    releaseDate: {
      required: false,
      type: 'string',
      custom: (v) => {
        if (!v) return null;
        const d = new Date(v);
        if (Number.isNaN(d.getTime()))
          return 'releaseDate must be a valid date';
        return null;
      },
    },
    isrc: {
      required: false,
      type: 'string',
      maxLength: 20,
      maxLengthMessage: 'ISRC cannot exceed 20 characters',
    },
    iswc: {
      required: false,
      type: 'string',
      maxLength: 20,
      maxLengthMessage: 'ISWC cannot exceed 20 characters',
    },
    composer: {
      required: false,
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Composer cannot exceed 100 characters',
    },
    publisher: {
      required: false,
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Publisher cannot exceed 100 characters',
    },
    releaseTitle: {
      required: false,
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Release title cannot exceed 100 characters',
    },
    albumTitle: {
      required: false,
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Album title cannot exceed 100 characters',
    },
    recordLabel: {
      required: false,
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'Record label cannot exceed 100 characters',
    },
    barcode: {
      required: false,
      type: 'string',
      maxLength: 50,
      maxLengthMessage: 'Barcode cannot exceed 50 characters',
    },
    pLine: {
      required: false,
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'P line cannot exceed 100 characters',
    },
    license: {
      required: false,
      type: 'string',
      enum: ['All Rights Reserved', 'Creative Commons'],
      enumMessage: 'License must be All Rights Reserved or Creative Commons',
    },
    containsExplicitContent: {
      required: false,
      type: 'boolean',
      typeMessage: 'containsExplicitContent must be true or false',
    },
    buyLink: {
      required: false,
      type: 'string',
      maxLength: 500,
      maxLengthMessage: 'Buy link cannot exceed 500 characters',
    },
    allowComments: {
      required: false,
      type: 'boolean',
      typeMessage: 'allowComments must be true or false',
    },
    displayStatsPublicly: {
      required: false,
      type: 'boolean',
      typeMessage: 'displayStatsPublicly must be true or false',
    },
    enableDirectDownloads: {
      required: false,
      type: 'boolean',
      typeMessage: 'enableDirectDownloads must be true or false',
    },
    enableContentId: {
      required: false,
      type: 'boolean',
      typeMessage: 'enableContentId must be true or false',
    },
    includeInRssFeed: {
      required: false,
      type: 'boolean',
      typeMessage: 'includeInRssFeed must be true or false',
    },
    previewStartTime: {
      required: false,
      type: 'number',
      min: 0,
      minMessage: 'Preview start time cannot be negative',
    },
    previewEndTime: {
      required: false,
      type: 'number',
      min: 0,
      minMessage: 'Preview end time cannot be negative',
      custom: (v) => {
        if (v === undefined || v === null) return null;
        if (v - 0 > 20)
          return 'Preview clip cannot exceed 20 seconds. Set previewStartTime accordingly.';
        return null;
      },
    },
  },
};
/**
 * PATCH /api/tracks/:id/visibility
 */
const updateVisibilitySchema = {
  params: {
    id: mongoIdParam(),
  },
  body: {
    isPublic: {
      required: true,
      type: 'boolean',
      typeMessage: 'isPublic must be true (Public) or false (Private)',
    },
  },
};

/**
 * GET /api/tracks/:permalink
 * Params-only — no body.
 */
const getTrackSchema = {
  params: {
    permalink: {
      required: true,
      type: 'string',
      minLength: 1,
      minLengthMessage: 'Permalink cannot be empty',
    },
  },
};

/**
 * GET /api/tracks/:id/download
 * DELETE /api/tracks/:id
 */
const trackIdParamSchema = {
  params: {
    id: mongoIdParam(),
  },
};

module.exports = {
  initiateUploadSchema,
  confirmUploadSchema,
  updateMetadataSchema,
  updateVisibilitySchema,
  getTrackSchema,
  trackIdParamSchema,
};
