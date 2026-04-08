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
      max: 500 * 1024 * 1024, // 500 MB hard cap
      maxMessage: 'File size must not exceed 500 MB',
    },
    duration: {
      required: true,
      type: 'number',
      min: 1,
      minMessage: 'Track duration must be at least 1 second',
      max: 10800, // 3 hours
      maxMessage: 'Track duration must not exceed 3 hours',
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
      maxLength: 50,
      maxLengthMessage: 'Genre must not exceed 50 characters',
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
