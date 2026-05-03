'use strict';
/**
 * 18_validations.test.js
 * Exhaustively covers ALL validation schemas in src/validations/
 * to push branch & line coverage above 97%.
 *
 * Strategy: run each schema through the real `validate` middleware (not mocked)
 * exercising every field rule: required, type, minLength, maxLength, min, max,
 * pattern, enum, itemType, maxItems, custom validators.
 */

const {
  validate,
  runFieldRules,
} = require('../middlewares/validationMiddleware');

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Synchronously invoke the `validate` middleware and return the first error
 * message it would pass to next(), or null if validation passes.
 */
const runValidate = (schema, { body = {}, params = {}, query = {} } = {}) => {
  let captured = null;
  const req = { body, params, query };
  const next = (err) => {
    captured = err || null;
  };
  validate(schema)(req, {}, next);
  return captured; // AppError or null
};

const ok = (schema, input) => expect(runValidate(schema, input)).toBeNull();
const fail = (schema, input, msgFragment) => {
  const err = runValidate(schema, input);
  expect(err).not.toBeNull();
  if (msgFragment) expect(err.message).toMatch(msgFragment);
};

// ────────────────────────────────────────────────────────────────────────────
// runFieldRules unit tests (covers all branches in validationMiddleware)
// ────────────────────────────────────────────────────────────────────────────

describe('runFieldRules — primitive coverage', () => {
  test('required: missing value returns requiredMessage', () => {
    expect(
      runFieldRules(
        undefined,
        { required: true, requiredMessage: 'needed' },
        'f'
      )
    ).toBe('needed');
  });
  test('required: null triggers default required error', () => {
    expect(runFieldRules(null, { required: true }, 'myField')).toBe(
      'myField is required'
    );
  });
  test('required: blank string triggers error', () => {
    expect(runFieldRules('   ', { required: true }, 'f')).toBeTruthy();
  });
  test('optional + empty → skip all checks → null', () => {
    expect(
      runFieldRules(undefined, { required: false, type: 'email' }, 'f')
    ).toBeNull();
  });

  // type checks
  test('type: string passes', () =>
    expect(runFieldRules('hello', { type: 'string' }, 'f')).toBeNull());
  test('type: string fails on number', () =>
    expect(runFieldRules(42, { type: 'string', typeMessage: 'bad' }, 'f')).toBe(
      'bad'
    ));
  test('type: number passes', () =>
    expect(runFieldRules(5, { type: 'number' }, 'f')).toBeNull());
  test('type: number fails on NaN', () =>
    expect(runFieldRules(NaN, { type: 'number' }, 'f')).toBeTruthy());
  test('type: boolean passes true', () =>
    expect(runFieldRules(true, { type: 'boolean' }, 'f')).toBeNull());
  test('type: boolean fails string', () =>
    expect(runFieldRules('yes', { type: 'boolean' }, 'f')).toBeTruthy());
  test('type: array passes', () =>
    expect(runFieldRules([1, 2], { type: 'array' }, 'f')).toBeNull());
  test('type: array fails non-array', () =>
    expect(runFieldRules({}, { type: 'array' }, 'f')).toBeTruthy());
  test('type: mongoId passes valid id', () =>
    expect(
      runFieldRules('507f1f77bcf86cd799439011', { type: 'mongoId' }, 'f')
    ).toBeNull());
  test('type: mongoId fails short string', () =>
    expect(runFieldRules('abc', { type: 'mongoId' }, 'f')).toBeTruthy());
  test('type: email passes', () =>
    expect(runFieldRules('a@b.com', { type: 'email' }, 'f')).toBeNull());
  test('type: email fails no domain', () =>
    expect(runFieldRules('notanemail', { type: 'email' }, 'f')).toBeTruthy());

  // string rules
  test('minLength: fails when too short', () => {
    expect(
      runFieldRules(
        'ab',
        { type: 'string', minLength: 5, minLengthMessage: 'too short' },
        'f'
      )
    ).toBe('too short');
  });
  test('minLength: passes at exact length', () => {
    expect(
      runFieldRules('abcde', { type: 'string', minLength: 5 }, 'f')
    ).toBeNull();
  });
  test('maxLength: fails when too long', () => {
    expect(
      runFieldRules(
        'abcdef',
        { type: 'string', maxLength: 3, maxLengthMessage: 'too long' },
        'f'
      )
    ).toBe('too long');
  });
  test('maxLength: passes at exact length', () => {
    expect(
      runFieldRules('abc', { type: 'string', maxLength: 3 }, 'f')
    ).toBeNull();
  });
  test('pattern: fails non-matching', () => {
    expect(
      runFieldRules(
        'ABC',
        { type: 'string', pattern: /^[a-z]+$/, patternMessage: 'lower only' },
        'f'
      )
    ).toBe('lower only');
  });
  test('pattern: passes matching value', () => {
    expect(
      runFieldRules('abc', { type: 'string', pattern: /^[a-z]+$/ }, 'f')
    ).toBeNull();
  });

  // number rules
  test('min: fails below minimum', () => {
    expect(
      runFieldRules(0, { type: 'number', min: 1, minMessage: 'too small' }, 'f')
    ).toBe('too small');
  });
  test('max: fails above maximum', () => {
    expect(
      runFieldRules(
        200,
        { type: 'number', max: 100, maxMessage: 'too big' },
        'f'
      )
    ).toBe('too big');
  });
  test('min + max: passes in range', () => {
    expect(
      runFieldRules(50, { type: 'number', min: 1, max: 100 }, 'f')
    ).toBeNull();
  });

  // array rules
  test('maxItems: fails over limit', () => {
    expect(
      runFieldRules(
        [1, 2, 3, 4],
        { type: 'array', maxItems: 2, maxItemsMessage: 'too many' },
        'f'
      )
    ).toBe('too many');
  });
  test('maxItems: passes at exact limit', () => {
    expect(
      runFieldRules([1, 2], { type: 'array', maxItems: 2 }, 'f')
    ).toBeNull();
  });
  test('itemType: passes valid items', () => {
    expect(
      runFieldRules(['a', 'b'], { type: 'array', itemType: 'string' }, 'f')
    ).toBeNull();
  });
  test('itemType: fails invalid items', () => {
    expect(
      runFieldRules(
        [1, 2],
        { type: 'array', itemType: 'string', itemTypeMessage: 'strings only' },
        'f'
      )
    ).toBe('strings only');
  });
  test('itemType: unknown type → allValid false', () => {
    expect(
      runFieldRules(['a'], { type: 'array', itemType: 'unknownType' }, 'f')
    ).toBeTruthy();
  });

  // enum rule
  test('enum: passes valid value', () => {
    expect(runFieldRules('a', { enum: ['a', 'b'] }, 'f')).toBeNull();
  });
  test('enum: fails invalid value with default message', () => {
    const msg = runFieldRules('c', { enum: ['a', 'b'] }, 'myField');
    expect(msg).toMatch('myField');
  });
  test('enum: fails with enumMessage', () => {
    expect(
      runFieldRules('c', { enum: ['a', 'b'], enumMessage: 'pick a or b' }, 'f')
    ).toBe('pick a or b');
  });

  // custom validator
  test('custom: passes when returns null', () => {
    expect(runFieldRules('ok', { custom: () => null }, 'f')).toBeNull();
  });
  test('custom: fails when returns message', () => {
    expect(runFieldRules('bad', { custom: () => 'invalid!' }, 'f')).toBe(
      'invalid!'
    );
  });

  // default min/max messages
  test('min: uses default message', () => {
    expect(runFieldRules(0, { type: 'number', min: 5 }, 'count')).toMatch(
      'count'
    );
  });
  test('max: uses default message', () => {
    expect(runFieldRules(200, { type: 'number', max: 10 }, 'count')).toMatch(
      'count'
    );
  });
  test('minLength: uses default message', () => {
    expect(
      runFieldRules('a', { type: 'string', minLength: 3 }, 'name')
    ).toMatch('name');
  });
  test('maxLength: uses default message', () => {
    expect(
      runFieldRules('abcdef', { type: 'string', maxLength: 2 }, 'name')
    ).toMatch('name');
  });
  test('maxItems: uses default message', () => {
    expect(
      runFieldRules([1, 2, 3], { type: 'array', maxItems: 1 }, 'list')
    ).toMatch('list');
  });
  test('itemType: uses default message', () => {
    expect(
      runFieldRules([1], { type: 'array', itemType: 'string' }, 'tags')
    ).toMatch('tags');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AUTH VALIDATION
// ────────────────────────────────────────────────────────────────────────────
describe('authValidation', () => {
  const {
    registerSchema,
    loginSchema,
    verifyEmailSchema,
    emailOnlySchema,
    resetPasswordSchema,
    requestEmailUpdateSchema,
    confirmEmailUpdateSchema,
    googleMobileSchema,
    refreshTokenSchema,
  } = require('../validations/authValidation');

  describe('registerSchema', () => {
    const valid = {
      email: 'user@test.com',
      password: 'Pass1234',
      displayName: 'JohnDoe',
      captchaToken: 'tok123456789',
    };

    test('passes with all required fields', () =>
      ok(registerSchema, { body: valid }));
    test('fails: missing email', () =>
      fail(registerSchema, { body: { ...valid, email: undefined } }));
    test('fails: invalid email format', () =>
      fail(registerSchema, { body: { ...valid, email: 'notanemail' } }));
    test('fails: password too short', () =>
      fail(registerSchema, { body: { ...valid, password: 'abc123' } }));
    test('fails: password too long', () =>
      fail(registerSchema, {
        body: { ...valid, password: 'a'.repeat(129) + '1' },
      }));
    test('fails: password no number', () =>
      fail(registerSchema, { body: { ...valid, password: 'OnlyLetters' } }));
    test('fails: displayName too short', () =>
      fail(registerSchema, { body: { ...valid, displayName: 'X' } }));
    test('fails: displayName too long', () =>
      fail(registerSchema, {
        body: { ...valid, displayName: 'X'.repeat(51) },
      }));
    test('fails: missing captchaToken', () =>
      fail(registerSchema, { body: { ...valid, captchaToken: undefined } }));
    test('passes: with optional gender', () =>
      ok(registerSchema, { body: { ...valid, gender: 'Male' } }));
    test('fails: invalid gender', () =>
      fail(registerSchema, { body: { ...valid, gender: 'Robot' } }));
    test('passes: with valid age', () =>
      ok(registerSchema, { body: { ...valid, age: 25 } }));
    test('fails: age too young', () =>
      fail(registerSchema, { body: { ...valid, age: 10 } }));
    test('fails: age too old', () =>
      fail(registerSchema, { body: { ...valid, age: 200 } }));
  });

  describe('loginSchema', () => {
    const valid = { email: 'u@test.com', password: 'any' };
    test('passes valid login', () => ok(loginSchema, { body: valid }));
    test('fails: missing email', () =>
      fail(loginSchema, { body: { password: 'any' } }));
    test('fails: bad email', () =>
      fail(loginSchema, { body: { email: 'bad', password: 'any' } }));
    test('fails: missing password', () =>
      fail(loginSchema, { body: { email: 'u@test.com' } }));
  });

  describe('verifyEmailSchema', () => {
    test('passes with long enough token', () =>
      ok(verifyEmailSchema, { body: { token: 'abc1234567' } }));
    test('fails: token too short', () =>
      fail(verifyEmailSchema, { body: { token: 'short' } }));
    test('fails: missing token', () => fail(verifyEmailSchema, { body: {} }));
  });

  describe('emailOnlySchema', () => {
    test('passes valid email', () =>
      ok(emailOnlySchema, { body: { email: 'x@y.com' } }));
    test('fails: missing email', () => fail(emailOnlySchema, { body: {} }));
  });

  describe('resetPasswordSchema', () => {
    const valid = { token: 'tok1234567890', newPassword: 'NewPass1' };
    test('passes valid reset', () => ok(resetPasswordSchema, { body: valid }));
    test('fails: short token', () =>
      fail(resetPasswordSchema, { body: { ...valid, token: 'short' } }));
    test('fails: weak new password', () =>
      fail(resetPasswordSchema, {
        body: { ...valid, newPassword: 'onlyalpha' },
      }));
  });

  describe('requestEmailUpdateSchema', () => {
    test('passes valid new email', () =>
      ok(requestEmailUpdateSchema, { body: { newEmail: 'new@test.com' } }));
    test('fails: missing newEmail', () =>
      fail(requestEmailUpdateSchema, { body: {} }));
    test('fails: invalid newEmail', () =>
      fail(requestEmailUpdateSchema, { body: { newEmail: 'bad' } }));
  });

  describe('confirmEmailUpdateSchema', () => {
    test('passes valid token', () =>
      ok(confirmEmailUpdateSchema, { body: { token: 'confirmtoken123' } }));
    test('fails: missing token', () =>
      fail(confirmEmailUpdateSchema, { body: {} }));
  });

  describe('googleMobileSchema', () => {
    test('passes with idToken', () =>
      ok(googleMobileSchema, { body: { idToken: 'google_id_token_value' } }));
    test('fails: missing idToken', () =>
      fail(googleMobileSchema, { body: {} }));
  });

  describe('refreshTokenSchema', () => {
    test('passes without refresh token (optional)', () =>
      ok(refreshTokenSchema, { body: {} }));
    test('passes with refresh token', () =>
      ok(refreshTokenSchema, { body: { refreshToken: 'mytoken' } }));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PROFILE VALIDATION
// ────────────────────────────────────────────────────────────────────────────
describe('profileValidation', () => {
  const {
    updateProfileSchema,
    updatePrivacySchema,
    updateTierSchema,
    updateSocialLinksSchema,
    deleteSocialLinkSchema,
  } = require('../validations/profileValidation');

  describe('updateProfileSchema', () => {
    test('passes with valid displayName', () =>
      ok(updateProfileSchema, { body: { displayName: 'DJ Max' } }));
    test('fails: displayName too short', () =>
      fail(updateProfileSchema, { body: { displayName: 'X' } }));
    test('fails: displayName too long', () =>
      fail(updateProfileSchema, { body: { displayName: 'X'.repeat(51) } }));
    test('passes: valid permalink', () =>
      ok(updateProfileSchema, { body: { permalink: 'my-artist' } }));
    test('fails: permalink too short', () =>
      fail(updateProfileSchema, { body: { permalink: 'xy' } }));
    test('fails: permalink invalid chars', () =>
      fail(updateProfileSchema, { body: { permalink: 'Hello World!' } }));
    test('passes: valid bio', () =>
      ok(updateProfileSchema, { body: { bio: 'I make beats' } }));
    test('fails: bio too long', () =>
      fail(updateProfileSchema, { body: { bio: 'x'.repeat(501) } }));
    test('passes: valid country', () =>
      ok(updateProfileSchema, { body: { country: 'Egypt' } }));
    test('fails: invalid country', () =>
      fail(updateProfileSchema, { body: { country: 'Narnia' } }));
    test('passes: empty country allowed', () =>
      ok(updateProfileSchema, { body: { country: '' } }));
    test('fails: city too long', () =>
      fail(updateProfileSchema, { body: { city: 'x'.repeat(101) } }));
    test('fails: genres item not string', () =>
      fail(updateProfileSchema, { body: { genres: [1] } }));
  });

  if (updatePrivacySchema) {
    describe('updatePrivacySchema', () => {
      test('passes isPrivate true', () =>
        ok(updatePrivacySchema, { body: { isPrivate: true } }));
      test('passes isPrivate false', () =>
        ok(updatePrivacySchema, { body: { isPrivate: false } }));
      test('fails: missing isPrivate', () =>
        fail(updatePrivacySchema, { body: {} }));
    });
  }

  if (updateTierSchema) {
    describe('updateTierSchema', () => {
      test('passes Artist', () =>
        ok(updateTierSchema, { body: { role: 'Artist' } }));
      test('passes Listener', () =>
        ok(updateTierSchema, { body: { role: 'Listener' } }));
      test('fails: invalid role', () =>
        fail(updateTierSchema, { body: { role: 'Superuser' } }));
    });
  }

  if (updateSocialLinksSchema) {
    describe('updateSocialLinksSchema', () => {
      test('passes valid url', () =>
        ok(updateSocialLinksSchema, {
          body: {
            socialLinks: [
              { platform: 'instagram', url: 'https://instagram.com/me' },
            ],
          },
        }));
      test('fails: missing platform or url', () =>
        fail(updateSocialLinksSchema, {
          body: { socialLinks: [{ platform: 'instagram' }] },
        }));
      test('fails: link is not object', () =>
        fail(updateSocialLinksSchema, {
          body: { socialLinks: ['not-object'] },
        }));
      test('fails: missing platform', () =>
        fail(updateSocialLinksSchema, {
          body: { socialLinks: [{ url: 'https://x.com' }] },
        }));
      test('fails: invalid url format', () =>
        fail(updateSocialLinksSchema, {
          body: { socialLinks: [{ platform: 'x', url: 'ftp://x.com' }] },
        }));
    });
  }

  if (deleteSocialLinkSchema) {
    describe('deleteSocialLinkSchema', () => {
      test('passes valid linkId param', () =>
        ok(deleteSocialLinkSchema, {
          params: { linkId: '507f1f77bcf86cd799439011' },
        }));
      test('fails: invalid linkId', () =>
        fail(deleteSocialLinkSchema, { params: { linkId: 'bad' } }));
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// TRACK VALIDATION
// ────────────────────────────────────────────────────────────────────────────
describe('trackValidation', () => {
  const {
    initiateUploadSchema,
    confirmUploadSchema,
    updateMetadataSchema,
    updateVisibilitySchema,
    getTrackSchema,
    trackIdParamSchema,
  } = require('../validations/trackValidation');

  const validBody = {
    title: 'My Track',
    format: 'audio/mpeg',
    size: 1024 * 1024,
    duration: 180,
  };

  describe('initiateUploadSchema', () => {
    test('passes minimal valid body', () =>
      ok(initiateUploadSchema, { body: validBody }));
    test('fails: missing title', () =>
      fail(initiateUploadSchema, { body: { ...validBody, title: undefined } }));
    test('fails: title too long', () =>
      fail(initiateUploadSchema, {
        body: { ...validBody, title: 'x'.repeat(101) },
      }));
    test('fails: invalid format', () =>
      fail(initiateUploadSchema, {
        body: { ...validBody, format: 'video/mp4' },
      }));
    test('fails: size = 0', () =>
      fail(initiateUploadSchema, { body: { ...validBody, size: 0 } }));
    test('fails: size too large', () =>
      fail(initiateUploadSchema, {
        body: { ...validBody, size: 600 * 1024 * 1024 },
      }));
    test('fails: duration < 1', () =>
      fail(initiateUploadSchema, { body: { ...validBody, duration: 0 } }));
    test('fails: duration > 3h', () =>
      fail(initiateUploadSchema, { body: { ...validBody, duration: 10801 } }));
    test('passes: with valid genre', () =>
      ok(initiateUploadSchema, { body: { ...validBody, genre: 'Pop' } }));
    test('fails: invalid genre', () =>
      fail(initiateUploadSchema, {
        body: { ...validBody, genre: 'Country Pop Fusion' },
      }));
    test('passes: description within limit', () =>
      ok(initiateUploadSchema, {
        body: { ...validBody, description: 'Nice' },
      }));
    test('fails: description too long', () =>
      fail(initiateUploadSchema, {
        body: { ...validBody, description: 'x'.repeat(1001) },
      }));
    test('passes: valid tags array', () =>
      ok(initiateUploadSchema, { body: { ...validBody, tags: ['a', 'b'] } }));
    test('fails: too many tags', () =>
      fail(initiateUploadSchema, {
        body: { ...validBody, tags: new Array(21).fill('tag') },
      }));
    test('fails: tag too long', () =>
      fail(initiateUploadSchema, {
        body: { ...validBody, tags: ['x'.repeat(31)] },
      }));
    test('fails: tag not string', () =>
      fail(initiateUploadSchema, {
        body: { ...validBody, tags: [1] },
      }));
    test('passes: valid releaseDate', () =>
      ok(initiateUploadSchema, {
        body: { ...validBody, releaseDate: '2025-01-01' },
      }));
    test('fails: invalid releaseDate', () =>
      fail(initiateUploadSchema, {
        body: { ...validBody, releaseDate: 'not-a-date' },
      }));
    test('passes: releaseDate null skips custom', () =>
      ok(initiateUploadSchema, { body: { ...validBody, releaseDate: null } }));
    test('passes: valid previewEndTime', () =>
      ok(initiateUploadSchema, { body: { ...validBody, previewEndTime: 15 } }));
    test('fails: previewEndTime > 20', () =>
      fail(initiateUploadSchema, {
        body: { ...validBody, previewEndTime: 25 },
      }));
    test('fails: previewEndTime negative', () =>
      fail(initiateUploadSchema, {
        body: { ...validBody, previewEndTime: -1 },
      }));
    test('fails: previewStartTime negative', () =>
      fail(initiateUploadSchema, {
        body: { ...validBody, previewStartTime: -1 },
      }));
    test('passes: previewEndTime null skips', () =>
      ok(initiateUploadSchema, {
        body: { ...validBody, previewEndTime: null },
      }));
    test('passes: valid license', () =>
      ok(initiateUploadSchema, {
        body: { ...validBody, license: 'Creative Commons' },
      }));
    test('fails: invalid license', () =>
      fail(initiateUploadSchema, { body: { ...validBody, license: 'MIT' } }));
    test('passes: boolean flags', () =>
      ok(initiateUploadSchema, {
        body: {
          ...validBody,
          isPublic: true,
          containsExplicitContent: false,
          allowComments: true,
        },
      }));
    test('fails: isPublic as string', () =>
      fail(initiateUploadSchema, { body: { ...validBody, isPublic: 'true' } }));
    test('passes: optional string metadata', () =>
      ok(initiateUploadSchema, {
        body: {
          ...validBody,
          isrc: 'USRC12345678',
          composer: 'Bach',
          publisher: 'UMG',
          releaseTitle: 'Album 1',
        },
      }));
    test('fails: isrc too long', () =>
      fail(initiateUploadSchema, {
        body: { ...validBody, isrc: 'x'.repeat(21) },
      }));
    test('passes: all audio formats', () => {
      [
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/x-wav',
        'audio/wave',
      ].forEach((fmt) => {
        ok(initiateUploadSchema, { body: { ...validBody, format: fmt } });
      });
    });
  });

  describe('confirmUploadSchema', () => {
    test('passes valid mongoId param', () =>
      ok(confirmUploadSchema, { params: { id: '507f1f77bcf86cd799439011' } }));
    test('fails: invalid id', () =>
      fail(confirmUploadSchema, { params: { id: 'bad' } }));
    test('fails: missing id', () => fail(confirmUploadSchema, { params: {} }));
  });

  describe('updateMetadataSchema', () => {
    const pId = '507f1f77bcf86cd799439011';
    test('passes empty body with valid param', () =>
      ok(updateMetadataSchema, { params: { id: pId }, body: {} }));
    test('fails: invalid id param', () =>
      fail(updateMetadataSchema, { params: { id: 'x' }, body: {} }));
    test('passes: update genre', () =>
      ok(updateMetadataSchema, {
        params: { id: pId },
        body: { genre: 'Rock' },
      }));
    test('fails: invalid genre', () =>
      fail(updateMetadataSchema, {
        params: { id: pId },
        body: { genre: 'Bluegrass' },
      }));
    test('passes: valid releaseDate', () =>
      ok(updateMetadataSchema, {
        params: { id: pId },
        body: { releaseDate: '2025-06-01' },
      }));
    test('fails: invalid releaseDate', () =>
      fail(updateMetadataSchema, {
        params: { id: pId },
        body: { releaseDate: 'yesterday' },
      }));
    test('passes: releaseDate null/undefined', () =>
      ok(updateMetadataSchema, {
        params: { id: pId },
        body: { releaseDate: null },
      }));
    test('passes: valid previewEndTime', () =>
      ok(updateMetadataSchema, {
        params: { id: pId },
        body: { previewEndTime: 10 },
      }));
    test('fails: previewEndTime > 20', () =>
      fail(updateMetadataSchema, {
        params: { id: pId },
        body: { previewEndTime: 21 },
      }));
    test('passes: null previewEndTime skips', () =>
      ok(updateMetadataSchema, {
        params: { id: pId },
        body: { previewEndTime: null },
      }));
    test('passes: tags with valid entries', () =>
      ok(updateMetadataSchema, {
        params: { id: pId },
        body: { tags: ['chill', 'lo-fi'] },
      }));
    test('fails: tag too long', () =>
      fail(updateMetadataSchema, {
        params: { id: pId },
        body: { tags: ['x'.repeat(31)] },
      }));
    test('fails: tag not string', () =>
      fail(updateMetadataSchema, {
        params: { id: pId },
        body: { tags: [1] },
      }));
    test('fails: buyLink too long', () =>
      fail(updateMetadataSchema, {
        params: { id: pId },
        body: { buyLink: 'x'.repeat(501) },
      }));
  });

  describe('updateVisibilitySchema', () => {
    const pId = '507f1f77bcf86cd799439011';
    test('passes isPublic true', () =>
      ok(updateVisibilitySchema, {
        params: { id: pId },
        body: { isPublic: true },
      }));
    test('passes isPublic false', () =>
      ok(updateVisibilitySchema, {
        params: { id: pId },
        body: { isPublic: false },
      }));
    test('fails: missing isPublic', () =>
      fail(updateVisibilitySchema, { params: { id: pId }, body: {} }));
    test('fails: invalid id', () =>
      fail(updateVisibilitySchema, {
        params: { id: 'bad' },
        body: { isPublic: true },
      }));
  });

  describe('getTrackSchema', () => {
    test('passes valid permalink', () =>
      ok(getTrackSchema, { params: { permalink: 'my-track' } }));
    test('fails: missing permalink', () =>
      fail(getTrackSchema, { params: {} }));
  });

  describe('trackIdParamSchema', () => {
    test('passes valid id', () =>
      ok(trackIdParamSchema, { params: { id: '507f1f77bcf86cd799439011' } }));
    test('fails: invalid id', () =>
      fail(trackIdParamSchema, { params: { id: 'abc' } }));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// INTERACTION VALIDATION
// ────────────────────────────────────────────────────────────────────────────
describe('interactionValidation', () => {
  const {
    trackInteractionSchema,
    trackEngagersSchema,
    userEngagementFeedSchema,
    createCommentSchema,
    getCommentsSchema,
    deleteCommentSchema,
  } = require('../validations/interactionValidation');

  const VALID_ID = '507f1f77bcf86cd799439011';

  describe('trackInteractionSchema', () => {
    test('passes valid track id', () =>
      ok(trackInteractionSchema, { params: { id: VALID_ID } }));
    test('fails: invalid id', () =>
      fail(trackInteractionSchema, { params: { id: 'bad' } }));
  });

  describe('trackEngagersSchema', () => {
    test('passes with valid params', () =>
      ok(trackEngagersSchema, { params: { id: VALID_ID } }));
    test('passes with pagination', () =>
      ok(trackEngagersSchema, {
        params: { id: VALID_ID },
        query: { page: '1', limit: '10' },
      }));
    test('fails: invalid page', () =>
      fail(trackEngagersSchema, {
        params: { id: VALID_ID },
        query: { page: 'abc' },
      }));
    test('fails: invalid limit', () =>
      fail(trackEngagersSchema, {
        params: { id: VALID_ID },
        query: { limit: 'abc' },
      }));
    test('fails: limit out of range', () =>
      fail(trackEngagersSchema, {
        params: { id: VALID_ID },
        query: { limit: '200' },
      }));
    test('fails: limit 0', () =>
      fail(trackEngagersSchema, {
        params: { id: VALID_ID },
        query: { limit: '0' },
      }));
    test('passes: limit at boundary 100', () =>
      ok(trackEngagersSchema, {
        params: { id: VALID_ID },
        query: { limit: '100' },
      }));
  });

  describe('userEngagementFeedSchema', () => {
    test('passes valid userId', () =>
      ok(userEngagementFeedSchema, { params: { userId: VALID_ID } }));
    test('fails: invalid userId', () =>
      fail(userEngagementFeedSchema, { params: { userId: 'bad' } }));
    test('passes with pagination', () =>
      ok(userEngagementFeedSchema, {
        params: { userId: VALID_ID },
        query: { page: '2', limit: '20' },
      }));
  });

  describe('createCommentSchema', () => {
    const validComment = { content: 'Nice track!', timestamp: 30 };
    test('passes valid comment', () =>
      ok(createCommentSchema, {
        params: { trackId: VALID_ID },
        body: validComment,
      }));
    test('fails: missing timestamp', () =>
      fail(createCommentSchema, {
        params: { trackId: VALID_ID },
        body: { content: 'Nice track!' },
      }));
    test('fails: empty content', () =>
      fail(createCommentSchema, {
        params: { trackId: VALID_ID },
        body: { ...validComment, content: '' },
      }));
    test('fails: content too long', () =>
      fail(createCommentSchema, {
        params: { trackId: VALID_ID },
        body: { ...validComment, content: 'x'.repeat(1001) },
      }));
    test('fails: negative timestamp', () =>
      fail(createCommentSchema, {
        params: { trackId: VALID_ID },
        body: { ...validComment, timestamp: -1 },
      }));
    test('passes: with parentCommentId', () =>
      ok(createCommentSchema, {
        params: { trackId: VALID_ID },
        body: { ...validComment, parentCommentId: VALID_ID },
      }));
    test('fails: invalid parentCommentId', () =>
      fail(createCommentSchema, {
        params: { trackId: VALID_ID },
        body: { ...validComment, parentCommentId: 'bad' },
      }));
    test('fails: invalid trackId', () =>
      fail(createCommentSchema, {
        params: { trackId: 'bad' },
        body: validComment,
      }));
  });

  describe('getCommentsSchema', () => {
    test('passes valid trackId', () =>
      ok(getCommentsSchema, { params: { trackId: VALID_ID } }));
    test('passes with pagination', () =>
      ok(getCommentsSchema, {
        params: { trackId: VALID_ID },
        query: { page: '1', limit: '50' },
      }));
    test('fails: invalid limit', () =>
      fail(getCommentsSchema, {
        params: { trackId: VALID_ID },
        query: { limit: '200' },
      }));
  });

  describe('deleteCommentSchema', () => {
    test('passes valid commentId', () =>
      ok(deleteCommentSchema, { params: { commentId: VALID_ID } }));
    test('fails: invalid commentId', () =>
      fail(deleteCommentSchema, { params: { commentId: 'x' } }));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// NETWORK VALIDATION
// ────────────────────────────────────────────────────────────────────────────
describe('networkValidation', () => {
  const {
    followSchema,
    blockSchema,
    getUserNetworkSchema,
    getSuggestedSchema,
  } = require('../validations/networkValidation');
  const ID = '507f1f77bcf86cd799439011';

  describe('followSchema', () => {
    test('passes valid id', () => ok(followSchema, { params: { id: ID } }));
    test('fails: invalid id', () =>
      fail(followSchema, { params: { id: 'bad' } }));
  });

  describe('blockSchema', () => {
    test('passes valid userId', () =>
      ok(blockSchema, { params: { userId: ID } }));
    test('fails: invalid userId', () =>
      fail(blockSchema, { params: { userId: 'x' } }));
  });

  describe('getUserNetworkSchema', () => {
    test('passes with valid params', () =>
      ok(getUserNetworkSchema, { params: { userId: ID } }));
    test('passes with pagination query', () =>
      ok(getUserNetworkSchema, {
        params: { userId: ID },
        query: { page: '1', limit: '20' },
      }));
    test('fails: limit < 1', () =>
      fail(getUserNetworkSchema, {
        params: { userId: ID },
        query: { limit: '0' },
      }));
    test('fails: limit > 100', () =>
      fail(getUserNetworkSchema, {
        params: { userId: ID },
        query: { limit: '101' },
      }));
    test('passes: limit null skips check', () =>
      ok(getUserNetworkSchema, {
        params: { userId: ID },
        query: { limit: null },
      }));
    test('fails: page not digits', () =>
      fail(getUserNetworkSchema, {
        params: { userId: ID },
        query: { page: 'abc' },
      }));
  });

  describe('getSuggestedSchema', () => {
    test('passes empty query', () => ok(getSuggestedSchema, { query: {} }));
    test('passes with valid pagination', () =>
      ok(getSuggestedSchema, { query: { page: '2', limit: '15' } }));
    test('fails: invalid page', () =>
      fail(getSuggestedSchema, { query: { page: 'x' } }));
    test('fails: limit too high', () =>
      fail(getSuggestedSchema, { query: { limit: '101' } }));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PLAYER VALIDATION
// ────────────────────────────────────────────────────────────────────────────
describe('playerValidation', () => {
  const {
    getStreamSchema,
    updatePlayerStateSchema,
    updateProgressSchema,
    recentlyPlayedSchema,
  } = require('../validations/playerValidation');
  const ID = '507f1f77bcf86cd799439011';

  describe('getStreamSchema', () => {
    test('passes valid track id', () =>
      ok(getStreamSchema, { params: { id: ID } }));
    test('fails: missing id', () => fail(getStreamSchema, { params: {} }));
  });

  describe('updatePlayerStateSchema', () => {
    test('passes empty body (all optional)', () =>
      ok(updatePlayerStateSchema, { body: {} }));
    test('passes: valid currentTrack mongoId', () =>
      ok(updatePlayerStateSchema, { body: { currentTrack: ID } }));
    test('fails: currentTrack not mongoId', () =>
      fail(updatePlayerStateSchema, { body: { currentTrack: 'bad' } }));
    test('passes: currentTime >= 0', () =>
      ok(updatePlayerStateSchema, { body: { currentTime: 0 } }));
    test('fails: currentTime < 0', () =>
      fail(updatePlayerStateSchema, { body: { currentTime: -1 } }));
    test('passes: valid queueContext', () =>
      ok(updatePlayerStateSchema, { body: { queueContext: 'feed' } }));
    test('fails: invalid queueContext', () =>
      fail(updatePlayerStateSchema, { body: { queueContext: 'invalid' } }));
    test('passes all queueContext values', () => {
      ['none', 'feed', 'playlist', 'track', 'station', 'search'].forEach(
        (ctx) => {
          ok(updatePlayerStateSchema, { body: { queueContext: ctx } });
        }
      );
    });
    test('passes: contextId as mongoId', () =>
      ok(updatePlayerStateSchema, { body: { contextId: ID } }));
    test('fails: contextId not mongoId', () =>
      fail(updatePlayerStateSchema, { body: { contextId: 'bad' } }));
    test('passes: isPlaying boolean', () =>
      ok(updatePlayerStateSchema, { body: { isPlaying: false } }));
    test('fails: isPlaying string', () =>
      fail(updatePlayerStateSchema, { body: { isPlaying: 'yes' } }));
  });

  describe('updateProgressSchema', () => {
    const valid = { trackId: ID, progress: 60 };
    test('passes valid progress', () =>
      ok(updateProgressSchema, { body: valid }));
    test('fails: missing trackId', () =>
      fail(updateProgressSchema, { body: { progress: 60 } }));
    test('fails: invalid trackId', () =>
      fail(updateProgressSchema, { body: { ...valid, trackId: 'bad' } }));
    test('fails: negative progress', () =>
      fail(updateProgressSchema, { body: { ...valid, progress: -1 } }));
    test('passes: with optional playlistId', () =>
      ok(updateProgressSchema, { body: { ...valid, playlistId: ID } }));
    test('fails: invalid playlistId', () =>
      fail(updateProgressSchema, { body: { ...valid, playlistId: 'bad' } }));
  });

  describe('recentlyPlayedSchema', () => {
    test('passes empty query', () => ok(recentlyPlayedSchema, { query: {} }));
    test('passes with pagination', () =>
      ok(recentlyPlayedSchema, { query: { page: '1', limit: '10' } }));
    test('fails: limit > 100', () =>
      fail(recentlyPlayedSchema, { query: { limit: '200' } }));
    test('passes: limit null skips', () =>
      ok(recentlyPlayedSchema, { query: { limit: null } }));
    test('fails: invalid page', () =>
      fail(recentlyPlayedSchema, { query: { page: 'abc' } }));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PLAYLIST VALIDATION
// ────────────────────────────────────────────────────────────────────────────
describe('playlistValidation', () => {
  const {
    playlistIdParamSchema,
    createPlaylistSchema,
    updatePlaylistSchema,
    updateTracksSchema,
  } = require('../validations/playlistValidation');
  const ID = '507f1f77bcf86cd799439011';

  describe('playlistIdParamSchema', () => {
    test('passes valid id', () =>
      ok(playlistIdParamSchema, { params: { id: ID } }));
    test('fails: invalid id', () =>
      fail(playlistIdParamSchema, { params: { id: 'bad' } }));
  });

  describe('createPlaylistSchema', () => {
    test('passes minimal body', () =>
      ok(createPlaylistSchema, { body: { title: 'My Mix' } }));
    test('fails: missing title', () =>
      fail(createPlaylistSchema, { body: {} }));
    test('fails: title too long', () =>
      fail(createPlaylistSchema, { body: { title: 'x'.repeat(101) } }));
    test('passes: valid releaseType', () =>
      ok(createPlaylistSchema, { body: { title: 'M', releaseType: 'album' } }));
    test('fails: invalid releaseType', () =>
      fail(createPlaylistSchema, { body: { title: 'M', releaseType: 'mix' } }));
    test('passes: valid tags', () =>
      ok(createPlaylistSchema, { body: { title: 'M', tags: ['chill'] } }));
    test('fails: too many tags', () =>
      fail(createPlaylistSchema, {
        body: { title: 'M', tags: new Array(31).fill('x') },
      }));
    test('fails: tags not strings', () =>
      fail(createPlaylistSchema, { body: { title: 'M', tags: [123] } }));
    test('passes: valid tracks array', () =>
      ok(createPlaylistSchema, { body: { title: 'M', tracks: [ID] } }));
    test('fails: too many tracks', () =>
      fail(createPlaylistSchema, {
        body: { title: 'M', tracks: new Array(501).fill(ID) },
      }));
    test('fails: tracks with invalid ids', () =>
      fail(createPlaylistSchema, { body: { title: 'M', tracks: ['bad'] } }));
    test('passes: isPrivate boolean', () =>
      ok(createPlaylistSchema, { body: { title: 'M', isPrivate: true } }));
    test('fails: isPrivate string', () =>
      fail(createPlaylistSchema, { body: { title: 'M', isPrivate: 'yes' } }));
    test('passes: description within limit', () =>
      ok(createPlaylistSchema, {
        body: { title: 'M', description: 'Cool playlist' },
      }));
    test('fails: description too long', () =>
      fail(createPlaylistSchema, {
        body: { title: 'M', description: 'x'.repeat(1001) },
      }));
    test('passes: upc within limit', () =>
      ok(createPlaylistSchema, { body: { title: 'M', upc: '012345678901' } }));
    test('fails: upc too long', () =>
      fail(createPlaylistSchema, {
        body: { title: 'M', upc: 'x'.repeat(51) },
      }));
  });

  describe('updatePlaylistSchema', () => {
    test('passes empty body update', () =>
      ok(updatePlaylistSchema, { params: { id: ID }, body: {} }));
    test('fails: invalid id param', () =>
      fail(updatePlaylistSchema, { params: { id: 'bad' }, body: {} }));
    test('passes: valid genre update', () =>
      ok(updatePlaylistSchema, {
        params: { id: ID },
        body: { genre: 'Electronic' },
      }));
    test('fails: genre too long', () =>
      fail(updatePlaylistSchema, {
        params: { id: ID },
        body: { genre: 'x'.repeat(51) },
      }));
    test('passes: valid releaseType update', () =>
      ok(updatePlaylistSchema, {
        params: { id: ID },
        body: { releaseType: 'ep' },
      }));
    test('fails: invalid releaseType', () =>
      fail(updatePlaylistSchema, {
        params: { id: ID },
        body: { releaseType: 'podcast' },
      }));
  });

  describe('updateTracksSchema', () => {
    test('passes valid tracks array', () =>
      ok(updateTracksSchema, { params: { id: ID }, body: { tracks: [ID] } }));
    test('fails: missing tracks', () =>
      fail(updateTracksSchema, { params: { id: ID }, body: {} }));
    test('fails: invalid track id', () =>
      fail(updateTracksSchema, {
        params: { id: ID },
        body: { tracks: ['bad'] },
      }));
    test('fails: too many tracks', () =>
      fail(updateTracksSchema, {
        params: { id: ID },
        body: { tracks: new Array(501).fill(ID) },
      }));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ADMIN VALIDATION
// ────────────────────────────────────────────────────────────────────────────
describe('adminValidation', () => {
  const {
    submitReportSchema,
    updateReportStatusSchema,
    idParamSchema,
  } = require('../validations/adminValidation');
  const ID = '507f1f77bcf86cd799439011';

  describe('submitReportSchema', () => {
    const valid = { targetType: 'Track', targetId: ID, reason: 'Copyright' };
    test('passes valid report', () => ok(submitReportSchema, { body: valid }));
    test('fails: invalid targetType', () =>
      fail(submitReportSchema, { body: { ...valid, targetType: 'Playlist' } }));
    test('fails: invalid targetId', () =>
      fail(submitReportSchema, { body: { ...valid, targetId: 'bad' } }));
    test('fails: invalid reason', () =>
      fail(submitReportSchema, { body: { ...valid, reason: 'Hate' } }));
    test('passes: all valid targetTypes', () => {
      ['Track', 'Comment', 'User'].forEach((t) =>
        ok(submitReportSchema, { body: { ...valid, targetType: t } })
      );
    });
    test('passes: all valid reasons', () => {
      ['Copyright', 'Inappropriate Content', 'Spam', 'Other'].forEach((r) =>
        ok(submitReportSchema, { body: { ...valid, reason: r } })
      );
    });
  });

  describe('updateReportStatusSchema', () => {
    test('passes valid status', () =>
      ok(updateReportStatusSchema, {
        params: { id: ID },
        body: { status: 'Resolved' },
      }));
    test('fails: invalid status', () =>
      fail(updateReportStatusSchema, {
        params: { id: ID },
        body: { status: 'Closed' },
      }));
    test('fails: invalid id param', () =>
      fail(updateReportStatusSchema, {
        params: { id: 'bad' },
        body: { status: 'Pending' },
      }));
    test('passes: all valid statuses', () => {
      ['Pending', 'Reviewed', 'Resolved'].forEach((s) =>
        ok(updateReportStatusSchema, {
          params: { id: ID },
          body: { status: s },
        })
      );
    });
  });

  describe('idParamSchema', () => {
    test('passes valid id', () => ok(idParamSchema, { params: { id: ID } }));
    test('fails: invalid id', () =>
      fail(idParamSchema, { params: { id: 'notanid' } }));
    test('fails: missing id', () => fail(idParamSchema, { params: {} }));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION VALIDATION
// ────────────────────────────────────────────────────────────────────────────
describe('subscriptionValidation', () => {
  const { checkoutSchema } = require('../validations/subscriptionValidation');

  test('passes Pro plan', () =>
    ok(checkoutSchema, { body: { planType: 'Pro' } }));
  test('passes Go+ plan', () =>
    ok(checkoutSchema, { body: { planType: 'Go+' } }));
  test('fails: invalid plan', () =>
    fail(checkoutSchema, { body: { planType: 'Basic' } }));
  test('fails: missing planType', () => fail(checkoutSchema, { body: {} }));
});

// ────────────────────────────────────────────────────────────────────────────
// MESSAGE VALIDATION
// ────────────────────────────────────────────────────────────────────────────
describe('messageValidation', () => {
  const {
    sendMessageSchema,
    getMessagesSchema,
    hideConversationSchema,
    editMessageSchema,
    deleteMessageSchema,
    markAsReadSchema,
  } = require('../validations/messageValidation');
  const ID = '507f1f77bcf86cd799439011';

  describe('sendMessageSchema', () => {
    test('passes with receiverId and content', () =>
      ok(sendMessageSchema, { body: { receiverId: ID, content: 'Hi!' } }));
    test('fails: missing receiverId', () =>
      fail(sendMessageSchema, { body: { content: 'Hi' } }));
    test('fails: invalid receiverId', () =>
      fail(sendMessageSchema, { body: { receiverId: 'bad', content: 'Hi' } }));
    test('passes: content-less (attachment only)', () =>
      ok(sendMessageSchema, {
        body: { receiverId: ID, attachmentType: 'Track', attachmentId: ID },
      }));
    test('fails: content too long', () =>
      fail(sendMessageSchema, {
        body: { receiverId: ID, content: 'x'.repeat(2001) },
      }));
    test('fails: invalid attachmentType', () =>
      fail(sendMessageSchema, {
        body: { receiverId: ID, attachmentType: 'Image' },
      }));
    test('passes: valid attachmentType Track', () =>
      ok(sendMessageSchema, {
        body: { receiverId: ID, attachmentType: 'Track' },
      }));
    test('passes: valid attachmentType Playlist', () =>
      ok(sendMessageSchema, {
        body: { receiverId: ID, attachmentType: 'Playlist' },
      }));
  });

  describe('getMessagesSchema', () => {
    test('passes valid conversationId', () =>
      ok(getMessagesSchema, { params: { conversationId: ID } }));
    test('fails: invalid conversationId', () =>
      fail(getMessagesSchema, { params: { conversationId: 'bad' } }));
  });

  describe('hideConversationSchema', () => {
    test('passes valid conversationId', () =>
      ok(hideConversationSchema, { params: { conversationId: ID } }));
    test('fails: missing conversationId', () =>
      fail(hideConversationSchema, { params: {} }));
  });

  describe('editMessageSchema', () => {
    test('passes valid messageId and content', () =>
      ok(editMessageSchema, {
        params: { messageId: ID },
        body: { content: 'Updated message' },
      }));
    test('fails: content too long', () =>
      fail(editMessageSchema, {
        params: { messageId: ID },
        body: { content: 'x'.repeat(2001) },
      }));
    test('fails: invalid messageId', () =>
      fail(editMessageSchema, {
        params: { messageId: 'bad' },
        body: { content: 'Hi' },
      }));
    test('fails: missing content', () =>
      fail(editMessageSchema, { params: { messageId: ID }, body: {} }));
  });

  describe('deleteMessageSchema', () => {
    test('passes valid messageId', () =>
      ok(deleteMessageSchema, { params: { messageId: ID } }));
    test('fails: invalid messageId', () =>
      fail(deleteMessageSchema, { params: { messageId: 'x' } }));
  });

  describe('markAsReadSchema', () => {
    test('passes valid conversationId', () =>
      ok(markAsReadSchema, { params: { conversationId: ID } }));
    test('fails: invalid conversationId', () =>
      fail(markAsReadSchema, { params: { conversationId: 'abc' } }));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// STATION VALIDATION
// ────────────────────────────────────────────────────────────────────────────
describe('stationValidation', () => {
  const {
    likeStationSchema,
    stationIdParamSchema,
    getLikedStationsSchema,
  } = require('../validations/stationValidation');
  const ID = '507f1f77bcf86cd799439011';

  describe('likeStationSchema', () => {
    test('passes genre station', () =>
      ok(likeStationSchema, { body: { stationType: 'genre', genre: 'Pop' } }));
    test('passes artist station', () =>
      ok(likeStationSchema, { body: { stationType: 'artist', artistId: ID } }));
    test('passes trending station', () =>
      ok(likeStationSchema, { body: { stationType: 'trending' } }));
    test('fails: missing stationType', () =>
      fail(likeStationSchema, { body: {} }));
    test('fails: invalid stationType', () =>
      fail(likeStationSchema, { body: { stationType: 'random' } }));
    test('passes: all valid stationTypes', () => {
      ['genre', 'artist', 'trending', 'curated', 'recommended'].forEach((t) =>
        ok(likeStationSchema, { body: { stationType: t } })
      );
    });
    test('passes: with stationTitle and description', () =>
      ok(likeStationSchema, {
        body: {
          stationType: 'trending',
          stationTitle: 'Hot',
          stationDescription: 'Top tracks',
        },
      }));
    test('fails: stationTitle too long', () =>
      fail(likeStationSchema, {
        body: { stationType: 'trending', stationTitle: 'x'.repeat(101) },
      }));
    test('fails: stationDescription too long', () =>
      fail(likeStationSchema, {
        body: { stationType: 'genre', stationDescription: 'x'.repeat(301) },
      }));
    test('fails: invalid artistId', () =>
      fail(likeStationSchema, {
        body: { stationType: 'artist', artistId: 'bad' },
      }));
    test('fails: genre too long', () =>
      fail(likeStationSchema, {
        body: { stationType: 'genre', genre: 'x'.repeat(51) },
      }));
  });

  describe('stationIdParamSchema', () => {
    test('passes valid stationId string', () =>
      ok(stationIdParamSchema, { params: { stationId: 'genre_pop' } }));
    test('fails: missing stationId', () =>
      fail(stationIdParamSchema, { params: {} }));
    test('fails: stationId too long', () =>
      fail(stationIdParamSchema, { params: { stationId: 'x'.repeat(201) } }));
  });

  describe('getLikedStationsSchema', () => {
    test('passes empty query', () => ok(getLikedStationsSchema, { query: {} }));
    test('passes with valid hydrate=true', () =>
      ok(getLikedStationsSchema, { query: { hydrate: 'true' } }));
    test('passes with hydrate=false', () =>
      ok(getLikedStationsSchema, { query: { hydrate: 'false' } }));
    test('fails: invalid hydrate value', () =>
      fail(getLikedStationsSchema, { query: { hydrate: 'yes' } }));
    test('passes: valid pagination', () =>
      ok(getLikedStationsSchema, { query: { page: '1', limit: '20' } }));
    test('fails: limit out of range', () =>
      fail(getLikedStationsSchema, { query: { limit: '0' } }));
    test('passes: limit null skips check', () =>
      ok(getLikedStationsSchema, { query: { limit: null } }));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// validate() middleware — edge cases
// ────────────────────────────────────────────────────────────────────────────
describe('validate middleware — edge cases', () => {
  const { validate } = require('../middlewares/validationMiddleware');

  test('schema with no body/params/query keys passes anything', () => {
    const schema = {};
    const next = jest.fn();
    validate(schema)({ body: {}, params: {}, query: {} }, {}, next);
    expect(next).toHaveBeenCalledWith(); // next() without args
  });

  test('handles missing req.body gracefully', () => {
    const schema = { body: { name: { required: false, type: 'string' } } };
    const next = jest.fn();
    validate(schema)({ params: {}, query: {} }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('collects first error only', () => {
    const schema = {
      body: {
        a: { required: true },
        b: { required: true },
      },
    };
    const err = runValidate(schema, { body: {} });
    expect(err).not.toBeNull();
    expect(err.statusCode).toBe(400);
  });
});
