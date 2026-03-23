const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const axios = require('axios'); // Needed for CAPTCHA verification
const User = require('../models/userModel');
const sendEmail = require('../utils/sendEmail');
const AppError = require('../utils/appError');

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const generateTokens = async (user) => {
  const payload = { id: user._id, role: user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });
  user.refreshToken = refreshToken;
  await user.save();
  return { token, refreshToken };
};

const verifyRefreshToken = async (incomingRefreshToken) => {
  try {
    const decoded = jwt.verify(
      incomingRefreshToken,
      process.env.JWT_REFRESH_SECRET
    );
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== incomingRefreshToken) {
      throw new Error('Invalid or revoked refresh token');
    }
    const { token, refreshToken } = await generateTokens(user);
    return { token, refreshToken, user };
  } catch (error) {
    throw new Error('Unauthorized');
  }
};

const getGoogleAuthUrl = () =>
  googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['email', 'profile'],
  });

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

const handleGoogleCallback = async (code) => {
  const { tokens } = await googleClient.getToken(code);
  googleClient.setCredentials(tokens);
  const ticket = await googleClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  const user = await findOrCreateGoogleUser(payload);
  const { token, refreshToken } = await generateTokens(user);
  return { user, token, refreshToken };
};

const handleMobileGoogleLogin = async (idToken) => {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: [
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID_2,
      process.env.GOOGLE_ANDROID_CLIENT_ID_3,
      process.env.GOOGLE_ANDROID_CLIENT_ID_4,
      process.env.GOOGLE_ANDROID_CLIENT_ID_5,
    ],
  });
  const payload = ticket.getPayload();
  const user = await findOrCreateGoogleUser(payload);
  const { token, refreshToken } = await generateTokens(user);
  return { user, token, refreshToken };
};

const loginUser = async (email, password) => {
  const user = await User.findOne({ email }).select('+password');
  if (!user) throw new AppError('Invalid email or password.', 401);
  const isMatch = await user.matchPassword(password);
  if (!isMatch) throw new AppError('Invalid email or password.', 401);
  if (user.isEmailVerified === false) {
    throw new AppError(
      'Please verify your email address before logging in.',
      403
    );
  }
  return user;
};

// UPDATED: Now requires and verifies a CAPTCHA token
const registerUser = async (userData, captchaToken) => {
  if (!captchaToken) throw new AppError('CAPTCHA token is required.', 400);

  // Verify CAPTCHA with Google
  const captchaVerifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${captchaToken}`;
  const captchaResponse = await axios.post(captchaVerifyUrl);

  if (!captchaResponse.data.success) {
    throw new AppError('CAPTCHA verification failed. Are you a bot?', 400);
  }

  const existingUser = await User.findOne({ email: userData.email });
  if (existingUser) throw new AppError('Email is already registered.', 409);

  const verificationToken = crypto.randomBytes(20).toString('hex');

  const user = await User.create({
    ...userData,
    // permalink,
    emailVerificationToken: verificationToken,
  });

  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  const message = `Welcome to BioBeats, ${user.displayName}!\n\nPlease verify your account by clicking the link below:\n\n${verificationUrl}\n\nIf you did not request this, please ignore this email.`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'BioBeats Account Verification',
      message,
    });
  } catch (err) {
    console.error('Email delivery failed:', err.message);
  }

  return { user, verificationToken };
};

const verifyEmail = async (token) => {
  const user = await User.findOne({ emailVerificationToken: token });
  if (!user) throw new AppError('Invalid or expired verification token.', 400);
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  await user.save();
  return user;
};

const generatePasswordReset = async (email) => {
  const user = await User.findOne({ email });
  if (!user) throw new AppError('No user found with that email.', 404);

  const resetToken = crypto.randomBytes(20).toString('hex');
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 mins
  await user.save();

  // NEW: Actually send the email via Nodemailer!
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const message = `You are receiving this email because you (or someone else) requested a password reset for your BioBeats account.\n\nPlease use the following link to reset your password:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email and your password will remain unchanged.`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'BioBeats Password Reset Token',
      message,
    });
  } catch (err) {
    console.error('Email delivery failed:', err.message);
    // If email fails, wipe the token so they can try again
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();
    throw new AppError('Email could not be sent. Please try again later.', 500);
  }

  return { user, resetToken };
};

const resetPassword = async (token, newPassword) => {
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpire: { $gt: Date.now() },
  });
  if (!user) {
    throw new AppError('Invalid or expired password reset token.', 400);
  }
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();
  return user;
};

// NEW: Logout User Function
const logoutUser = async (userId) => {
  await User.findByIdAndUpdate(userId, { refreshToken: null });
  return true;
};

const resendVerificationEmail = async (email) => {
  const user = await User.findOne({ email });

  // Silently return if user not found or already verified
  // (prevents email enumeration)
  if (!user || user.isEmailVerified) return;

  const verificationToken = crypto.randomBytes(20).toString('hex');
  user.emailVerificationToken = verificationToken;
  await user.save();

  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  const message = `Hi ${user.displayName},\n\nHere is your new verification link:\n\n${verificationUrl}\n\nThis link does not expire automatically — request a new one if needed.`;

  await sendEmail({
    email: user.email,
    subject: 'BioBeats — New Verification Link',
    message,
  });
};

const requestEmailUpdate = async (userId, newEmail) => {
  // 1. Check the new email isn't already taken
  const existing = await User.findOne({ email: newEmail });
  if (existing) {
    throw new AppError('That email address is already registered.', 409);
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found.', 404);

  // 2. Generate a token and temporarily store the pending new email
  const token = crypto.randomBytes(20).toString('hex');
  user.pendingEmail = newEmail; // <-- add this field to userModel
  user.pendingEmailToken = token; // <-- add this field to userModel
  await user.save();

  // 3. Send the verification link to the NEW address (not the current one)
  const confirmUrl = `${process.env.FRONTEND_URL}/confirm-email-update?token=${token}`;
  const message = `Hi ${user.displayName},\n\nClick the link below to confirm your new email address:\n\n${confirmUrl}\n\nIf you did not request this, you can ignore this email.`;

  await sendEmail({
    email: newEmail, // send to the NEW address, not current
    subject: 'BioBeats — Confirm Your New Email',
    message,
  });
};

// Fix 3: Confirm and apply the email change
const confirmEmailUpdate = async (token) => {
  const user = await User.findOne({ pendingEmailToken: token });
  if (!user || !user.pendingEmail) {
    throw new AppError('Invalid or expired email update token.', 400);
  }

  user.email = user.pendingEmail;
  user.pendingEmail = undefined;
  user.pendingEmailToken = undefined;
  await user.save();

  return user;
};

module.exports = {
  generateTokens,
  verifyRefreshToken,
  getGoogleAuthUrl,
  handleGoogleCallback,
  handleMobileGoogleLogin,
  registerUser,
  verifyEmail,
  generatePasswordReset,
  resetPassword,
  loginUser,
  logoutUser,
  resendVerificationEmail,
  requestEmailUpdate,
  confirmEmailUpdate,
};
