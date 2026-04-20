'use strict';
/**
 * authService.test.js
 * Imports the REAL authService and mocks all its dependencies.
 */

jest.mock('../models/userModel');
jest.mock('../utils/sendEmail');
jest.mock('jsonwebtoken');
jest.mock('crypto');
jest.mock('axios');
jest.mock('google-auth-library');

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');

const User = require('../models/userModel');
const sendEmail = require('../utils/sendEmail');
const authService = require('../services/authService');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const mkUser = (overrides = {}) => ({
  _id: '507f1f77bcf86cd799439011',
  email: 'dj@beats.com',
  displayName: 'DJ Test',
  googleId: null,
  isEmailVerified: false,
  emailVerificationToken: 'vtoken123456789012',
  resetPasswordToken: 'rtoken',
  resetPasswordExpire: Date.now() + 600000,
  refreshToken: 'old-rt',
  role: 'Listener',
  isPremium: false,
  followerCount: 0,
  followingCount: 0,
  avatarUrl: 'default.png',
  permalink: 'dj-test',
  pendingEmail: null,
  pendingEmailToken: null,
  save: jest.fn().mockResolvedValue(true),
  matchPassword: jest.fn(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'jwtsecret';
  process.env.JWT_REFRESH_SECRET = 'jwtrsecret';
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.RECAPTCHA_SECRET_KEY = 'captchakey';
});

// ---------------------------------------------------------------------------
// generateTokens
// ---------------------------------------------------------------------------
describe('generateTokens', () => {
  test('signs access + refresh tokens and saves user', async () => {
    jwt.sign.mockReturnValueOnce('acc').mockReturnValueOnce('ref');
    const user = mkUser();
    const r = await authService.generateTokens(user);
    expect(r.token).toBe('acc');
    expect(r.refreshToken).toBe('ref');
    expect(user.refreshToken).toBe('ref');
    expect(user.save).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// verifyRefreshToken
// ---------------------------------------------------------------------------
describe('verifyRefreshToken', () => {
  test('returns new tokens for valid token', async () => {
    jwt.verify.mockReturnValueOnce({ id: '1' });
    jwt.sign.mockReturnValueOnce('newacc').mockReturnValueOnce('newref');
    const user = mkUser({ refreshToken: 'mytoken' });
    User.findById.mockResolvedValue(user);
    const r = await authService.verifyRefreshToken('mytoken');
    expect(r.token).toBe('newacc');
    expect(r.user).toBe(user);
  });

  test('throws Unauthorized when jwt throws', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('bad');
    });
    await expect(authService.verifyRefreshToken('bad')).rejects.toThrow(
      'Unauthorized'
    );
  });

  test('throws Unauthorized when user not found', async () => {
    jwt.verify.mockReturnValueOnce({ id: '1' });
    User.findById.mockResolvedValue(null);
    await expect(authService.verifyRefreshToken('tok')).rejects.toThrow(
      'Unauthorized'
    );
  });

  test('throws Unauthorized when tokens do not match', async () => {
    jwt.verify.mockReturnValueOnce({ id: '1' });
    User.findById.mockResolvedValue(mkUser({ refreshToken: 'different' }));
    await expect(authService.verifyRefreshToken('tok')).rejects.toThrow(
      'Unauthorized'
    );
  });
});

// ---------------------------------------------------------------------------
// getGoogleAuthUrl
// ---------------------------------------------------------------------------
describe('getGoogleAuthUrl', () => {
  test('returns a value without throwing', () => {
    expect(() => authService.getGoogleAuthUrl()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// loginUser
// ---------------------------------------------------------------------------
describe('loginUser', () => {
  test('returns user on valid credentials and verified email', async () => {
    const user = mkUser({
      isEmailVerified: true,
      matchPassword: jest.fn().mockResolvedValue(true),
    });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    const r = await authService.loginUser('dj@beats.com', 'pass123');
    expect(r).toBe(user);
  });

  test('throws 401 when user not found', async () => {
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    await expect(authService.loginUser('x@x.com', 'p')).rejects.toThrow(
      'Invalid email or password.'
    );
  });

  test('throws 401 when password wrong', async () => {
    const user = mkUser({ matchPassword: jest.fn().mockResolvedValue(false) });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    await expect(
      authService.loginUser('dj@beats.com', 'wrong')
    ).rejects.toThrow('Invalid email or password.');
  });

  test('throws 403 when email not verified', async () => {
    const user = mkUser({
      isEmailVerified: false,
      matchPassword: jest.fn().mockResolvedValue(true),
    });
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    await expect(authService.loginUser('dj@beats.com', 'pass')).rejects.toThrow(
      'Please verify your email'
    );
  });
});

// ---------------------------------------------------------------------------
// registerUser
// ---------------------------------------------------------------------------
describe('registerUser', () => {
  test('throws 400 when no captcha', async () => {
    await expect(authService.registerUser({}, null)).rejects.toThrow(
      'CAPTCHA token is required.'
    );
  });

  test('throws 400 when captcha fails', async () => {
    axios.post.mockResolvedValue({ data: { success: false } });
    await expect(authService.registerUser({}, 'bad')).rejects.toThrow(
      'CAPTCHA verification failed'
    );
  });

  test('throws 409 when email taken', async () => {
    axios.post.mockResolvedValue({ data: { success: true } });
    User.findOne.mockResolvedValue(mkUser());
    await expect(
      authService.registerUser({ email: 'dj@beats.com' }, 'tok')
    ).rejects.toThrow('Email is already registered.');
  });

  test('creates user and sends verification email', async () => {
    axios.post.mockResolvedValue({ data: { success: true } });
    User.findOne.mockResolvedValue(null);
    crypto.randomBytes.mockReturnValue({ toString: () => 'vtoken' });
    const newUser = mkUser({ email: 'new@beats.com', displayName: 'New' });
    User.create.mockResolvedValue(newUser);
    sendEmail.mockResolvedValue(undefined);
    const r = await authService.registerUser(
      { email: 'new@beats.com', displayName: 'New' },
      'valid'
    );
    expect(r.user).toBe(newUser);
    expect(sendEmail).toHaveBeenCalled();
  });

  test('silently continues if email send fails', async () => {
    axios.post.mockResolvedValue({ data: { success: true } });
    User.findOne.mockResolvedValue(null);
    crypto.randomBytes.mockReturnValue({ toString: () => 'tok' });
    User.create.mockResolvedValue(mkUser({ email: 'x@x.com' }));
    sendEmail.mockRejectedValue(new Error('SMTP'));
    await expect(
      authService.registerUser({ email: 'x@x.com' }, 'v')
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// verifyEmail
// ---------------------------------------------------------------------------
describe('verifyEmail', () => {
  test('verifies user and clears token', async () => {
    const user = mkUser();
    User.findOne.mockResolvedValue(user);
    const r = await authService.verifyEmail('vtoken123456789012');
    expect(r.isEmailVerified).toBe(true);
    expect(user.save).toHaveBeenCalled();
  });

  test('throws 400 for invalid token', async () => {
    User.findOne.mockResolvedValue(null);
    await expect(authService.verifyEmail('bad')).rejects.toThrow(
      'Invalid or expired verification token.'
    );
  });
});

// ---------------------------------------------------------------------------
// generatePasswordReset
// ---------------------------------------------------------------------------
describe('generatePasswordReset', () => {
  test('creates token and sends email', async () => {
    const user = mkUser();
    User.findOne.mockResolvedValue(user);
    crypto.randomBytes.mockReturnValue({ toString: () => 'rtok' });
    sendEmail.mockResolvedValue(undefined);
    const r = await authService.generatePasswordReset('dj@beats.com');
    expect(r.resetToken).toBe('rtok');
    expect(sendEmail).toHaveBeenCalled();
  });

  test('throws 404 when user not found', async () => {
    User.findOne.mockResolvedValue(null);
    await expect(
      authService.generatePasswordReset('no@user.com')
    ).rejects.toThrow('No user found with that email.');
  });

  test('clears token and throws 500 if email fails', async () => {
    const user = mkUser();
    User.findOne.mockResolvedValue(user);
    crypto.randomBytes.mockReturnValue({ toString: () => 'rtok' });
    sendEmail.mockRejectedValue(new Error('SMTP'));
    await expect(
      authService.generatePasswordReset('dj@beats.com')
    ).rejects.toThrow('Email could not be sent');
    expect(user.resetPasswordToken).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resetPassword
// ---------------------------------------------------------------------------
describe('resetPassword', () => {
  test('resets password on valid token', async () => {
    const user = mkUser();
    User.findOne.mockResolvedValue(user);
    const r = await authService.resetPassword('rtoken', 'NewPass1');
    expect(r.password).toBe('NewPass1');
    expect(r.resetPasswordToken).toBeUndefined();
  });

  test('throws 400 on invalid token', async () => {
    User.findOne.mockResolvedValue(null);
    await expect(authService.resetPassword('bad', 'pass')).rejects.toThrow(
      'Invalid or expired password reset token.'
    );
  });
});

// ---------------------------------------------------------------------------
// logoutUser
// ---------------------------------------------------------------------------
describe('logoutUser', () => {
  test('clears refresh token in DB', async () => {
    User.findByIdAndUpdate.mockResolvedValue(true);
    const r = await authService.logoutUser('uid');
    expect(r).toBe(true);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('uid', {
      refreshToken: null,
    });
  });
});

// ---------------------------------------------------------------------------
// resendVerificationEmail
// ---------------------------------------------------------------------------
describe('resendVerificationEmail', () => {
  test('returns silently when user not found', async () => {
    User.findOne.mockResolvedValue(null);
    await expect(
      authService.resendVerificationEmail('x@x.com')
    ).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('returns silently when already verified', async () => {
    User.findOne.mockResolvedValue(mkUser({ isEmailVerified: true }));
    await expect(
      authService.resendVerificationEmail('dj@beats.com')
    ).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('sends new verification email to unverified user', async () => {
    const user = mkUser({ isEmailVerified: false });
    User.findOne.mockResolvedValue(user);
    crypto.randomBytes.mockReturnValue({ toString: () => 'ntok' });
    sendEmail.mockResolvedValue(undefined);
    await authService.resendVerificationEmail('dj@beats.com');
    expect(sendEmail).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// requestEmailUpdate
// ---------------------------------------------------------------------------
describe('requestEmailUpdate', () => {
  test('throws 409 when new email already taken', async () => {
    User.findOne.mockResolvedValue(mkUser());
    await expect(
      authService.requestEmailUpdate('uid', 'taken@email.com')
    ).rejects.toThrow('already registered');
  });

  test('throws 404 when user not found', async () => {
    User.findOne.mockResolvedValue(null);
    User.findById.mockResolvedValue(null);
    await expect(
      authService.requestEmailUpdate('uid', 'new@email.com')
    ).rejects.toThrow('User not found.');
  });

  test('stores pending email and sends confirmation', async () => {
    User.findOne.mockResolvedValue(null);
    const user = mkUser();
    User.findById.mockResolvedValue(user);
    crypto.randomBytes.mockReturnValue({ toString: () => 'etok' });
    sendEmail.mockResolvedValue(undefined);
    await authService.requestEmailUpdate('uid', 'new@email.com');
    expect(user.pendingEmail).toBe('new@email.com');
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@email.com' })
    );
  });
});

// ---------------------------------------------------------------------------
// confirmEmailUpdate
// ---------------------------------------------------------------------------
describe('confirmEmailUpdate', () => {
  test('applies email change on valid token', async () => {
    const user = mkUser({
      pendingEmail: 'new@email.com',
      pendingEmailToken: 'etok',
    });
    User.findOne.mockResolvedValue(user);
    const r = await authService.confirmEmailUpdate('etok');
    expect(r.email).toBe('new@email.com');
    expect(r.pendingEmail).toBeUndefined();
  });

  test('throws 400 on invalid token', async () => {
    User.findOne.mockResolvedValue(null);
    await expect(authService.confirmEmailUpdate('bad')).rejects.toThrow(
      'Invalid or expired email update token.'
    );
  });

  test('throws 400 when pendingEmail missing', async () => {
    User.findOne.mockResolvedValue(
      mkUser({ pendingEmail: null, pendingEmailToken: 'tok' })
    );
    await expect(authService.confirmEmailUpdate('tok')).rejects.toThrow(
      'Invalid or expired email update token.'
    );
  });
});
