const authService = require('../services/authService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const cookieOptions = {
  httpOnly: true, // Prevents XSS attacks (JS cannot read the cookie)
  secure: process.env.NODE_ENV === 'production', // Use HTTPS in production
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
};

const attachAuthCookies = (res, token, refreshToken) => {
  res.cookie('accessToken', token, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

// Consistent user shape for every auth response
// Frontend always gets same fields — no second request needed
const formatUser = (user) => ({
  _id: user._id,
  displayName: user.displayName,
  permalink: user.permalink,
  avatarUrl: user.avatarUrl,
  role: user.role,
  isEmailVerified: user.isEmailVerified,
  isPremium: user.isPremium,
  followerCount: user.followerCount,
  followingCount: user.followingCount,
});

exports.refreshToken = catchAsync(async (req, res, next) => {
  const refreshToken =
    (req.cookies && req.cookies.refreshToken) ||
    (req.body && req.body.refreshToken);

  if (!refreshToken)
    return next(new AppError('Refresh token is required', 400));

  const {
    token: newAccessToken,
    refreshToken: newRefreshToken,
    user,
  } = await authService.verifyRefreshToken(refreshToken);

  attachAuthCookies(res, newAccessToken, newRefreshToken);

  res.status(200).json({
    success: true,
    message: 'Tokens refreshed successfully',
    data: { user: formatUser(user) },
  });
});

exports.getGoogleAuthUrl = (req, res) => {
  const url = authService.getGoogleAuthUrl();
  res.status(200).json({ success: true, data: { url } });
};

exports.handleGoogleCallback = catchAsync(async (req, res, next) => {
  const { code } = req.query;
  if (!code) return next(new AppError('Authorization code is missing', 400));

  const { user, token, refreshToken } =
    await authService.handleGoogleCallback(code);

  attachAuthCookies(res, token, refreshToken);

  const frontendUrl = `${process.env.FRONTEND_URL}/google/callback?permalink=${user.permalink}`;
  res.redirect(frontendUrl);
});

exports.loginWithGoogleMobile = catchAsync(async (req, res, next) => {
  const { idToken } = req.body;
  if (!idToken) return next(new AppError('idToken is required', 400));

  const { user, token, refreshToken } =
    await authService.handleMobileGoogleLogin(idToken);

  res.status(200).json({
    success: true,
    data: { user: formatUser(user), token, refreshToken },
  });
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password)
    return next(new AppError('Please provide email and password', 400));

  const user = await authService.loginUser(email, password);
  const { token, refreshToken } = await authService.generateTokens(user);

  attachAuthCookies(res, token, refreshToken);

  res.status(200).json({
    success: true,
    data: { user: formatUser(user) },
  });
});
// UPDATED: Extracts and passes captchaToken
exports.register = catchAsync(async (req, res, next) => {
  const { email, password, age, displayName, gender, captchaToken } = req.body;

  const { user } = await authService.registerUser(
    { email, password, age, displayName, gender },
    captchaToken
  );

  res.status(201).json({
    success: true,
    data: { user: formatUser(user) },
  });
});

// FIX: returns updated user so frontend can flip isEmailVerified in state immediately
exports.verifyEmail = catchAsync(async (req, res, next) => {
  const { token } = req.body;
  const user = await authService.verifyEmail(token);

  res.status(200).json({
    success: true,
    message: 'Email verified. You may now upload tracks.',
    data: { user: formatUser(user) },
  });
});

exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  if (!email) {
    return next(new AppError('Email is required', 400));
  }

  await authService.generatePasswordReset(email);
  res.status(200).json({
    success: true,
    message: 'If an account exists, a reset link has been sent.',
  });
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return next(new AppError('Token and newPassword are required', 400));
  }

  await authService.resetPassword(token, newPassword);
  res
    .status(200)
    .json({ success: true, message: 'Password reset successfully.' });
});

// NEW: Logout Controller
exports.logout = catchAsync(async (req, res) => {
  await authService.logoutUser(req.user._id);

  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');

  res.status(200).json({
    success: true,
    message: 'Successfully logged out. Session terminated.',
  });
});

exports.resendVerification = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  if (!email) {
    return next(new AppError('Email is required', 400));
  }

  await authService.resendVerificationEmail(email).catch(() => null);

  res.status(200).json({
    success: true,
    message:
      'If your account exists and is unverified, a new link has been sent.',
  });
});

exports.requestEmailUpdate = catchAsync(async (req, res, next) => {
  const { newEmail } = req.body;
  if (!newEmail) {
    return next(new AppError('newEmail is required', 400));
  }

  await authService.requestEmailUpdate(req.user._id, newEmail);
  res.status(200).json({
    success: true,
    message:
      'Verification email sent to your new address. Confirm it to complete the change.',
  });
});

exports.confirmEmailUpdate = catchAsync(async (req, res, next) => {
  const { token } = req.body;
  if (!token) {
    return next(new AppError('Token is required', 400));
  }

  await authService.confirmEmailUpdate(token);
  res.status(200).json({
    success: true,
    message: 'Email updated successfully.',
  });
});
