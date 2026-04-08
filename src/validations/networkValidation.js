/**
 * networkValidation.js  —  Module 3: Followers & Social Graph
 *
 * Covers:
 *   POST    /api/network/:id/follow
 *   DELETE  /api/network/:id/follow
 *   POST    /api/network/:userId/block
 *   DELETE  /api/network/:userId/block
 *   GET     /api/network/:userId/followers   (query pagination)
 *   GET     /api/network/:userId/following   (query pagination)
 *   GET     /api/network/suggested           (query pagination)
 *   GET     /api/network/blocked-users
 *   GET     /api/network/feed
 */

// ─── Reusable Rule Fragments ───────────────────────────────────────────────────

const mongoIdParam = (paramName) => ({
  required: true,
  type: 'mongoId',
  typeMessage: `${paramName} must be a valid user ID`,
});

const paginationQuery = {
  page: {
    required: false,
    type: 'string', // Query params arrive as strings; controller parses to int
    pattern: /^\d+$/,
    patternMessage: 'page must be a positive integer',
  },
  limit: {
    required: false,
    type: 'string',
    pattern: /^\d+$/,
    patternMessage: 'limit must be a positive integer',
    custom: (v) => {
      if (v === undefined || v === null) return null;
      const n = parseInt(v, 10);
      if (n < 1 || n > 100) return 'limit must be between 1 and 100';
      return null;
    },
  },
};

// ─── Schemas ───────────────────────────────────────────────────────────────────

/**
 * POST /api/network/:id/follow
 * DELETE /api/network/:id/follow
 */
const followSchema = {
  params: {
    id: mongoIdParam('Target user ID'),
  },
};

/**
 * POST /api/network/:userId/block
 * DELETE /api/network/:userId/block
 */
const blockSchema = {
  params: {
    userId: mongoIdParam('User ID to block/unblock'),
  },
};

/**
 * GET /api/network/:userId/followers
 * GET /api/network/:userId/following
 */
const getUserNetworkSchema = {
  params: {
    userId: mongoIdParam('User ID'),
  },
  query: paginationQuery,
};

/**
 * GET /api/network/suggested
 */
const getSuggestedSchema = {
  query: paginationQuery,
};

module.exports = {
  followSchema,
  blockSchema,
  getUserNetworkSchema,
  getSuggestedSchema,
};
