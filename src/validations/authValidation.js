/**
 * authValidation.js  —  Module 1: Authentication & User Management
 *
 * Covers:
 *   POST   /api/auth/register
 *   POST   /api/auth/login
 *   POST   /api/auth/verify-email
 *   POST   /api/auth/resend-verification
 *   POST   /api/auth/forgot-password
 *   PATCH  /api/auth/reset-password
 *   PATCH  /api/auth/update-email          (protected)
 *   POST   /api/auth/confirm-email-update
 *   POST   /api/auth/google/mobile
 */

// ─── Shared Rule Fragments ─────────────────────────────────────────────────────

const emailField = {
  required: true,
  type: 'email',
  typeMessage: 'Please provide a valid email address',
};

const passwordField = {
  required: true,
  type: 'string',
  minLength: 8,
  minLengthMessage: 'Password must be at least 8 characters',
  maxLength: 128,
  maxLengthMessage: 'Password must not exceed 128 characters',
  pattern: /^(?=.*[a-zA-Z])(?=.*\d).+$/,
  patternMessage: 'Password must contain at least one letter and one number',
};

const tokenField = {
  required: true,
  type: 'string',
  minLength: 10,
  minLengthMessage: 'Invalid token format',
};

// ─── Schemas ───────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 */
const registerSchema = {
  body: {
    email: emailField,
    password: passwordField,
    displayName: {
      required: true,
      type: 'string',
      minLength: 2,
      minLengthMessage: 'Display name must be at least 2 characters',
      maxLength: 50,
      maxLengthMessage: 'Display name must not exceed 50 characters',
    },
    age: {
      required: false,
      type: 'number',
      min: 13,
      minMessage: 'You must be at least 13 years old to register',
      max: 120,
      maxMessage: 'Please enter a valid age',
    },
    gender: {
      required: false,
      enum: ['Female', 'Male', 'Custom', 'Prefer not to say'],
      enumMessage:
        'Gender must be one of: Female, Male, Custom, Prefer not to say',
    },
    captchaToken: {
      required: true,
      type: 'string',
      requiredMessage: 'CAPTCHA verification is required',
    },
  },
};

/**
 * POST /api/auth/login
 */
const loginSchema = {
  body: {
    email: emailField,
    password: {
      required: true,
      type: 'string',
      minLength: 1,
      requiredMessage: 'Password is required',
    },
  },
};

/**
 * POST /api/auth/verify-email
 */
const verifyEmailSchema = {
  body: {
    token: tokenField,
  },
};

/**
 * POST /api/auth/resend-verification
 * POST /api/auth/forgot-password
 */
const emailOnlySchema = {
  body: {
    email: emailField,
  },
};

/**
 * PATCH /api/auth/reset-password
 */
const resetPasswordSchema = {
  body: {
    token: tokenField,
    newPassword: {
      ...passwordField,
      requiredMessage: 'New password is required',
    },
  },
};

/**
 * PATCH /api/auth/update-email  (protected — user is logged in)
 */
const requestEmailUpdateSchema = {
  body: {
    newEmail: {
      ...emailField,
      requiredMessage: 'New email address is required',
    },
  },
};

/**
 * POST /api/auth/confirm-email-update
 */
const confirmEmailUpdateSchema = {
  body: {
    token: tokenField,
  },
};

/**
 * POST /api/auth/google/mobile
 */
const googleMobileSchema = {
  body: {
    idToken: {
      required: true,
      type: 'string',
      requiredMessage: 'Google idToken is required',
    },
  },
};

/**
 * POST /api/auth/refresh
 * Only validates if token is sent via body (cookie path bypasses this)
 */
const refreshTokenSchema = {
  body: {
    refreshToken: {
      required: false, // Optional — token can also come from cookie
      type: 'string',
    },
  },
};

module.exports = {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  emailOnlySchema,
  resetPasswordSchema,
  requestEmailUpdateSchema,
  confirmEmailUpdateSchema,
  googleMobileSchema,
  refreshTokenSchema,
};
