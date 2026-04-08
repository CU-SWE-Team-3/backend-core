/**
 * playerValidation.js  —  Module 5: Playback & Streaming Engine
 *
 * Covers:
 *   GET  /api/player/:id/stream       (getStreamingUrl)
 *   GET  /api/player/state            (getPlayerState — no input)
 *   PUT  /api/player/state            (updatePlayerState)
 *   POST /api/history/progress        (updateProgress)
 *   GET  /api/history/recently-played (query pagination)
 */

// ─── Shared Fragments ──────────────────────────────────────────────────────────

const mongoIdParam = (label) => ({
  required: true,
  type: 'mongoId',
  typeMessage: `${label} must be a valid MongoDB ObjectId`,
});

const paginationQuery = {
  page: {
    required: false,
    type: 'string',
    pattern: /^\d+$/,
    patternMessage: 'page must be a positive integer',
  },
  limit: {
    required: false,
    type: 'string',
    pattern: /^\d+$/,
    patternMessage: 'limit must be a positive integer',
    custom: (v) => {
      if (!v) return null;
      const n = parseInt(v, 10);
      if (n < 1 || n > 100) return 'limit must be between 1 and 100';
      return null;
    },
  },
};

// ─── Schemas ───────────────────────────────────────────────────────────────────

/**
 * GET /api/player/:id/stream
 */
const getStreamSchema = {
  params: {
    id: mongoIdParam('Track ID'),
  },
};

/**
 * PUT /api/player/state
 * All fields optional — controller merges with existing state.
 */
const updatePlayerStateSchema = {
  body: {
    currentTrack: {
      required: false,
      type: 'mongoId',
      typeMessage: 'currentTrack must be a valid Track ID',
    },
    currentTime: {
      required: false,
      type: 'number',
      min: 0,
      minMessage: 'currentTime cannot be negative',
    },
    isPlaying: {
      required: false,
      type: 'boolean',
      typeMessage: 'isPlaying must be true or false',
    },
    queueContext: {
      required: false,
      enum: ['none', 'feed', 'playlist', 'track', 'station', 'search'],
      enumMessage:
        'queueContext must be one of: none, feed, playlist, track, station, search',
    },
    contextId: {
      required: false,
      type: 'mongoId',
      typeMessage: 'contextId must be a valid MongoDB ObjectId',
    },
  },
};

/**
 * POST /api/history/progress
 */
const updateProgressSchema = {
  body: {
    trackId: {
      required: true,
      type: 'mongoId',
      typeMessage: 'trackId must be a valid Track ID',
    },
    progress: {
      required: true,
      type: 'number',
      min: 0,
      minMessage: 'progress cannot be negative',
      // No hard max — the service caps at track.duration
    },
  },
};

/**
 * GET /api/history/recently-played
 */
const recentlyPlayedSchema = {
  query: paginationQuery,
};

module.exports = {
  getStreamSchema,
  updatePlayerStateSchema,
  updateProgressSchema,
  recentlyPlayedSchema,
};
