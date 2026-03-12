// src/controllers/auth.controller.js
const authService = require('../services/authService');

// ==========================================
// 1. JWT REFRESH ENDPOINT
// ==========================================
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res
        .status(400)
        .json({ success: false, error: 'Refresh token is required' });
    }

    // Call your service to rotate the tokens
    const tokens = await authService.verifyRefreshToken(refreshToken);

    res.status(200).json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    // If the token is invalid or expired, return a 401 Unauthorized
    res.status(401).json({ success: false, error: error.message });
  }
};

// ==========================================
// 2. GOOGLE OAUTH ENDPOINTS
// ==========================================

// This endpoint just sends the Google Login URL to the frontend
exports.getGoogleAuthUrl = (req, res) => {
  const url = authService.getGoogleAuthUrl();
  res.status(200).json({
    success: true,
    data: { url },
  });
};

// Google redirects here after the user logs in
exports.handleGoogleCallback = async (req, res, next) => {
  try {
    // Google puts the authorization code in the URL query (?code=...)
    const { code } = req.query;

    if (!code) {
      return res
        .status(400)
        .json({ success: false, error: 'Authorization code is missing' });
    }

    // Pass the code to your service to get the user and tokens
    const { user, token, refreshToken } =
      await authService.handleGoogleCallback(code);

    res.status(200).json({
      success: true,
      data: { user, token, refreshToken },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: 'Failed to authenticate with Google' });
  }
};

// ==========================================
// MOBILE NATIVE OAUTH ENDPOINT
// ==========================================
exports.loginWithGoogleMobile = async (req, res, next) => {
  try {
    // Mobile apps will send this in the JSON body
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'idToken is required in the request body',
      });
    }

    // Call the awesome service function you just refactored!
    const { user, token, refreshToken } =
      await authService.handleMobileGoogleLogin(idToken);

    res.status(200).json({
      success: true,
      data: { user, token, refreshToken },
    });
  } catch (error) {
    console.error('Mobile Auth Error:', error);
    res
      .status(401)
      .json({ success: false, error: 'Invalid Google Mobile Token' });
  }
};
