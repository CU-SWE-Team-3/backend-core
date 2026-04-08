/**
 * interactionValidation.js  —  Module 6: Engagement & Social Interactions
 *
 * Covers:
 *   POST    /api/tracks/:id/like
 *   DELETE  /api/tracks/:id/like
 *   POST    /api/tracks/:id/repost
 *   DELETE  /api/tracks/:id/repost
 *   GET     /api/tracks/:id/likers        (query pagination)
 *   GET     /api/tracks/:id/reposters     (query pagination)
 *   GET     /api/profile/:userId/likes    (query pagination)
 *   GET     /api/profile/:userId/reposts  (query pagination)
 *   POST    /api/tracks/:trackId/comments
 *   GET     /api/tracks/:trackId/comments (query pagination)
 *   DELETE  /api/comments/:commentId
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
 * POST /api/tracks/:id/like
 * POST /api/tracks/:id/repost
 * DELETE /api/tracks/:id/like
 * DELETE /api/tracks/:id/repost
 */
const trackInteractionSchema = {
  params: {
    id: mongoIdParam('Track ID'),
  },
};

/**
 * GET /api/tracks/:id/likers
 * GET /api/tracks/:id/reposters
 */
const trackEngagersSchema = {
  params: {
    id: mongoIdParam('Track ID'),
  },
  query: paginationQuery,
};

/**
 * GET /api/profile/:userId/likes
 * GET /api/profile/:userId/reposts
 */
const userEngagementFeedSchema = {
  params: {
    userId: mongoIdParam('User ID'),
  },
  query: paginationQuery,
};

/**
 * POST /api/tracks/:trackId/comments
 */
const createCommentSchema = {
  params: {
    trackId: mongoIdParam('Track ID'),
  },
  body: {
    content: {
      required: true,
      type: 'string',
      minLength: 1,
      minLengthMessage: 'Comment cannot be empty',
      maxLength: 1000,
      maxLengthMessage: 'Comment must not exceed 1000 characters',
    },
    timestamp: {
      required: true,
      type: 'number',
      min: 0,
      minMessage: 'Timestamp cannot be negative',
      // No hard max — the service/schema validates against track duration implicitly
    },
    parentCommentId: {
      required: false,
      type: 'mongoId',
      typeMessage: 'parentCommentId must be a valid comment ID',
    },
  },
};

/**
 * GET /api/tracks/:trackId/comments
 */
const getCommentsSchema = {
  params: {
    trackId: mongoIdParam('Track ID'),
  },
  query: paginationQuery,
};

/**
 * DELETE /api/comments/:commentId
 */
const deleteCommentSchema = {
  params: {
    commentId: mongoIdParam('Comment ID'),
  },
};

module.exports = {
  trackInteractionSchema,
  trackEngagersSchema,
  userEngagementFeedSchema,
  createCommentSchema,
  getCommentsSchema,
  deleteCommentSchema,
};
