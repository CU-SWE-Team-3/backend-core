const VALID_STATION_TYPES = ['genre', 'artist', 'trending', 'curated', 'recommended'];

/**
 * POST /api/stations/:stationId/like
 */
exports.likeStationSchema = {
  body: {
    stationType: {
      required: true,
      type: 'string',
      enum: VALID_STATION_TYPES,
      enumMessage: `stationType must be one of: ${VALID_STATION_TYPES.join(', ')}`,
    },
    stationTitle: {
      required: false,
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'stationTitle cannot exceed 100 characters',
    },
    stationDescription: {
      required: false,
      type: 'string',
      maxLength: 300,
      maxLengthMessage: 'stationDescription cannot exceed 300 characters',
    },
    artistId: {
      required: false,
      type: 'mongoId',
      typeMessage: 'artistId must be a valid MongoDB ObjectId',
    },
    genre: {
      required: false,
      type: 'string',
      maxLength: 50,
      maxLengthMessage: 'genre cannot exceed 50 characters',
    },
  },
};

/**
 * Shared param schema for routes that carry :stationId (string, not mongoId)
 */
exports.stationIdParamSchema = {
  params: {
    stationId: {
      required: true,
      type: 'string',
      minLength: 1,
      minLengthMessage: 'stationId cannot be empty',
      maxLength: 200,
      maxLengthMessage: 'stationId cannot exceed 200 characters',
    },
  },
};

/**
 * GET /api/stations/liked
 */
exports.getLikedStationsSchema = {
  query: {
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
    hydrate: {
      required: false,
      type: 'string',
      enum: ['true', 'false'],
      enumMessage: 'hydrate must be "true" or "false"',
    },
  },
};
