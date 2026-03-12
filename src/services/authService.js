const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/userModel');

// Initialize the Google Client
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// ==========================================
// 1. JWT TOKEN MANAGEMENT
// ==========================================

/**
 * Generates both short-lived access and long-lived refresh tokens.
 * Saves the refresh token to the database.
 */
const generateTokens = async (user) => {
  // The payload is the data hidden inside the token
  const payload = { id: user._id, role: user.role };

  // Access Token (Expires in 15 mins) -> Sent in Authorization header
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });

  // Refresh Token (Expires in 7 days) -> Stored in DB and often sent in a secure cookie or body
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });

  // Save the refresh token to the DB so we can revoke it later if needed
  user.refreshToken = refreshToken;
  await user.save();

  return { token, refreshToken };
};

/**
 * Verifies an incoming refresh token and rotates it for a new pair.
 */
const verifyRefreshToken = async (incomingRefreshToken) => {
  try {
    // 1. Verify the signature mathematically
    const decoded = jwt.verify(
      incomingRefreshToken,
      process.env.JWT_REFRESH_SECRET
    );

    // 2. Find the user
    const user = await User.findById(decoded.id);

    // 3. Ensure the token matches the one in the database (Prevents revoked token usage)
    if (!user || user.refreshToken !== incomingRefreshToken) {
      throw new Error('Invalid or revoked refresh token');
    }

    // 4. Issue a fresh pair of tokens (Token Rotation)
    return generateTokens(user);
  } catch (error) {
    throw new Error('Unauthorized');
  }
};

// ==========================================
// 2. GOOGLE OAUTH FLOW
// ==========================================

/**
 * Generates the URL to redirect the user to Google's login screen.
 */
const getGoogleAuthUrl = () =>
  googleClient.generateAuthUrl({
    access_type: 'offline', // Gets a refresh token from Google if needed
    scope: ['email', 'profile'], // We just want their email and public profile info
  });

/**
 * Handles the redirect back from Google, verifies the user, and logs them in.
 */

/**
 * PRIVATE HELPER: Finds an existing user or creates a new one from a Google Payload.
 */
const findOrCreateGoogleUser = async (payload) => {
  let user = await User.findOne({ email: payload.email });

  if (!user) {
    user = new User({
      email: payload.email,
      displayName: payload.name,
      googleId: payload.sub,
      isEmailVerified: true,
      avatarUrl: payload.picture,
    });
    await user.save();
  } else if (!user.googleId) {
    user.googleId = payload.sub;
    await user.save();
  }

  return user;
};

/**
 * Handles Web Redirect Login
 */
const handleGoogleCallback = async (code) => {
  // 1. Get tokens and payload from Google
  const { tokens } = await googleClient.getToken(code);
  // console.log('🔥 GRAB THIS ID_TOKEN FOR POSTMAN:', tokens.id_token);
  googleClient.setCredentials(tokens);

  const ticket = await googleClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  // 2. Use our DRY helper function!
  const user = await findOrCreateGoogleUser(payload);

  // 3. Generate tokens
  const { token, refreshToken } = await generateTokens(user);

  return { user, token, refreshToken };
};

/**
 * Handles Mobile Native Login
 */
const handleMobileGoogleLogin = async (idToken) => {
  // 1. Verify the mobile token with Google
  const ticket = await googleClient.verifyIdToken({
    idToken: idToken,
    audience: [
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
    ],
  });
  const payload = ticket.getPayload();

  // 2. Use our DRY helper function again!
  const user = await findOrCreateGoogleUser(payload);

  // 3. Generate tokens
  const { token, refreshToken } = await generateTokens(user);

  return { user, token, refreshToken };
};

module.exports = {
  generateTokens,
  verifyRefreshToken,
  getGoogleAuthUrl,
  handleGoogleCallback,
  handleMobileGoogleLogin,
};
