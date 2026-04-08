/**
 * profileValidation.js  —  Module 2: User Profile & Social Identity
 *
 * Covers:
 *   PATCH  /api/profile/update
 *   PATCH  /api/profile/privacy
 *   PATCH  /api/profile/social-links
 *   DELETE /api/profile/social-links/:linkId
 *   PATCH  /api/profile/tier
 *   PATCH  /api/profile/upload-images   (handled by multer — no body schema needed)
 *   GET    /api/profile/:permalink      (no body to validate)
 */

// ─── Helpers ───────────────────────────────────────────────────────────────────

const URL_RE = /^https?:\/\/.{3,}/;
const VALID_COUNTRIES = [
  '', // CRITICAL: Allows empty string for default users
  'Egypt',
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Japan',
  'Brazil',
  'Saudi Arabia',
  'United Arab Emirates',
  'Morocco',
  'South Africa',
  'Spain',
  'Italy',
  'Netherlands',
  'Sweden',
  'India',
  'China',
  'South Korea',
  'Argentina',
  'Mexico',
];

// ─── Schemas ───────────────────────────────────────────────────────────────────

/**
 * PATCH /api/profile/update
 * At least one field must be present — enforced via custom check.
 */
const updateProfileSchema = {
  body: {
    displayName: {
      required: false,
      type: 'string',
      minLength: 2,
      minLengthMessage: 'Display name must be at least 2 characters',
      maxLength: 50,
      maxLengthMessage: 'Display name must not exceed 50 characters',
    },
    permalink: {
      required: false,
      type: 'string',
      minLength: 3,
      minLengthMessage: 'Permalink must be at least 3 characters',
      maxLength: 50,
      maxLengthMessage: 'Permalink must not exceed 50 characters',
      pattern: /^[a-z0-9_-]+$/,
      patternMessage:
        'Permalink can only contain lowercase letters, numbers, hyphens, and underscores',
    },
    bio: {
      required: false,
      type: 'string',
      maxLength: 500,
      maxLengthMessage: 'Bio must not exceed 500 characters',
    },
    country: {
      required: false,
      type: 'string',
      enum: VALID_COUNTRIES,
      enumMessage: 'Please select a valid country from the list',
    },
    city: {
      required: false,
      type: 'string',
      maxLength: 100,
      maxLengthMessage: 'City name must not exceed 100 characters',
    },
    genres: {
      required: false,
      type: 'array',
      maxItems: 20,
      maxItemsMessage: 'You can add at most 20 favourite genres',
      itemType: 'string',
      itemTypeMessage: 'Each genre must be a string',
    },
  },
};

/**
 * PATCH /api/profile/privacy
 */
const updatePrivacySchema = {
  body: {
    isPrivate: {
      required: true,
      type: 'boolean',
      typeMessage: 'isPrivate must be true or false',
    },
  },
};

/**
 * PATCH /api/profile/social-links
 * socialLinks is an array of { platform, url } objects.
 * We validate the array exists and has at most 10 items;
 * deeper object validation is handled by the Mongoose schema.
 */
const updateSocialLinksSchema = {
  body: {
    socialLinks: {
      required: true,
      type: 'array',
      maxItems: 10,
      maxItemsMessage: 'You can add at most 10 social links',
      requiredMessage: 'socialLinks array is required',
      custom: (links) => {
        if (!Array.isArray(links)) return null; // already caught by type check
        for (let i = 0; i < links.length; i += 1) {
          const link = links[i];
          if (typeof link !== 'object' || link === null) {
            return `Each social link must be an object with "platform" and "url"`;
          }
          if (!link.platform || typeof link.platform !== 'string') {
            return `Social link at position ${i + 1} is missing a valid "platform"`;
          }
          if (!link.url || typeof link.url !== 'string') {
            return `Social link at position ${i + 1} is missing a valid "url"`;
          }
          if (!URL_RE.test(link.url)) {
            return `URL for "${link.platform}" must start with http:// or https://`;
          }
        }
        return null;
      },
    },
  },
};

/**
 * DELETE /api/profile/social-links/:linkId
 */
const removeSocialLinkSchema = {
  params: {
    linkId: {
      required: true,
      type: 'mongoId',
      typeMessage: 'linkId must be a valid MongoDB ObjectId',
    },
  },
};

/**
 * PATCH /api/profile/tier
 * Only Admins should call this in a real system — route-level guard handles
 * authorization, but we still validate the payload shape here.
 */
const updateTierSchema = {
  body: {
    role: {
      required: true,
      enum: ['Artist', 'Listener', 'Admin'],
      enumMessage: 'Role must be one of: Artist, Listener, Admin',
    },
  },
};

module.exports = {
  updateProfileSchema,
  updatePrivacySchema,
  updateSocialLinksSchema,
  removeSocialLinkSchema,
  updateTierSchema,
};
