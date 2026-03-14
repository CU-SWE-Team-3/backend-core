const authService = require('../services/authService');

const cookieOptions = {
  httpOnly: true, // Prevents XSS attacks (JS cannot read the cookie)
  secure: process.env.NODE_ENV === 'production', // Use HTTPS in production
  sameSite: 'strict', // Prevents CSRF attacks
};

exports.refreshToken = async (req, res, next) => {
  try {
    // FIXED: Safely check cookies and body using Optional Chaining (?.)
    const refreshToken =
      (req.cookies && req.cookies.refreshToken) ||
      (req.body && req.body.refreshToken);

    if (!refreshToken) {
      return res
        .status(400)
        .json({ success: false, error: 'Refresh token is required' });
    }

    // 2. Verify and generate new tokens
    const { token: newAccessToken, refreshToken: newRefreshToken } =
      await authService.verifyRefreshToken(refreshToken);

    // 3. Set the NEW cookies
    res.cookie('accessToken', newAccessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refreshToken', newRefreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: 'Tokens refreshed successfully',
    });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
};

exports.getGoogleAuthUrl = (req, res) => {
  const url = authService.getGoogleAuthUrl();
  res.status(200).json({ success: true, data: { url } });
};

exports.handleGoogleCallback = async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code)
      return res
        .status(400)
        .json({ success: false, error: 'Authorization code is missing' });

    const { user, token, refreshToken } =
      await authService.handleGoogleCallback(code);

    // --- ADD THESE LINES TO SET THE COOKIES ---
    res.cookie('accessToken', token, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    // ------------------------------------------

    res
      .status(200)
      .json({ success: true, data: { user, token, refreshToken } });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: 'Failed to authenticate with Google' });
  }
};

exports.loginWithGoogleMobile = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken)
      return res
        .status(400)
        .json({ success: false, error: 'idToken is required' });

    const { user, token, refreshToken } =
      await authService.handleMobileGoogleLogin(idToken);

    // --- ADD THESE TWO LINES HERE ---
    res.cookie('accessToken', token, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    // --------------------------------

    res
      .status(200)
      .json({ success: true, data: { user, token, refreshToken } });
  } catch (error) {
    res
      .status(401)
      .json({ success: false, error: 'Invalid Google Mobile Token' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide email and password',
        statusCode: 400,
      });
    }

    const user = await authService.loginUser(email, password);
    const { token, refreshToken } = await authService.generateTokens(user);

    // Attach cookies to the response
    res.cookie('accessToken', token, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    }); // 15 mins
    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    }); // 7 days

    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        displayName: user.displayName,
        isEmailVerified: user.isEmailVerified,
        role: user.role,
      },
    });
  } catch (error) {
    res
      .status(401)
      .json({ success: false, error: error.message, statusCode: 401 });
  }
};

// UPDATED: Extracts and passes captchaToken
exports.register = async (req, res) => {
  try {
    const { email, password, age, displayName, gender, captchaToken } =
      req.body;
    const { user, verificationToken } = await authService.registerUser(
      { email, password, age, displayName, gender },
      captchaToken
    );
    res.status(201).json({
      _id: user._id,
      permalink: user.permalink,
      displayName: user.displayName,
      isEmailVerified: user.isEmailVerified,
      role: user.role,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
    });
  } catch (error) {
    res
      .status(400)
      .json({ success: false, error: error.message, statusCode: 400 });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;
    await authService.verifyEmail(token);
    res.status(200).json({
      success: true,
      message: 'Email verified. You may now upload tracks.',
    });
  } catch (error) {
    res
      .status(400)
      .json({ success: false, error: error.message, statusCode: 400 });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const { resetToken } = await authService.generatePasswordReset(email);
    res.status(200).json({
      success: true,
      message: 'If an account exists, a reset link has been sent.',
    });
  } catch (error) {
    res
      .status(404)
      .json({ success: false, error: error.message, statusCode: 404 });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    await authService.resetPassword(token, newPassword);
    res
      .status(200)
      .json({ success: true, message: 'Password reset successfully.' });
  } catch (error) {
    res
      .status(400)
      .json({ success: false, error: error.message, statusCode: 400 });
  }
};

// NEW: Logout Controller
exports.logout = async (req, res) => {
  try {
    // Remove the refresh token from the database
    await authService.logoutUser(req.user._id);

    // Clear the cookies in the browser
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    res.status(200).json({
      success: true,
      message: 'Successfully logged out. Session terminated.',
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: 'Server error during logout' });
  }
};
