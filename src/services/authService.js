const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const axios = require('axios'); // Needed for CAPTCHA verification
const User = require('../models/userModel');
const sendEmail = require('../utils/sendEmail');

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
    return generateTokens(user);
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
    idToken: idToken,
    audience: [
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
    ],
  });
  const payload = ticket.getPayload();
  const user = await findOrCreateGoogleUser(payload);
  const { token, refreshToken } = await generateTokens(user);
  return { user, token, refreshToken };
};

const loginUser = async (email, password) => {
  const user = await User.findOne({ email }).select('+password');
  if (!user) throw new Error('Invalid email or password.');
  const isMatch = await user.matchPassword(password);
  if (!isMatch) throw new Error('Invalid email or password.');
  return user;
};

// UPDATED: Now requires and verifies a CAPTCHA token
const registerUser = async (userData, captchaToken) => {
  if (!captchaToken) throw new Error('CAPTCHA token is required.');

  // Verify CAPTCHA with Google
  const captchaVerifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${captchaToken}`;
  const captchaResponse = await axios.post(captchaVerifyUrl);

  if (!captchaResponse.data.success) {
    throw new Error('CAPTCHA verification failed. Are you a bot?');
  }

  const existingUser = await User.findOne({ email: userData.email });
  if (existingUser) throw new Error('Email is already registered.');

  const verificationToken = crypto.randomBytes(20).toString('hex');

  const user = await User.create({
    ...userData,
    // permalink,
    emailVerificationToken: verificationToken,
  });

  const verificationUrl = `http://localhost:5000/api/auth/verify-email?token=${verificationToken}`;
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
  if (!user) throw new Error('Invalid or expired verification token.');
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  await user.save();
  return user;
};

const generatePasswordReset = async (email) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error('No user found with that email.');

  const resetToken = crypto.randomBytes(20).toString('hex');
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 mins
  await user.save();

  // NEW: Actually send the email via Nodemailer!
  const message = `You are receiving this email because you (or someone else) requested a password reset for your BioBeats account.\n\nPlease use the following token to reset your password:\n\n${resetToken}\n\nIf you did not request this, please ignore this email and your password will remain unchanged.`;

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
    throw new Error('Email could not be sent. Please try again later.');
  }

  return { user, resetToken };
};

const resetPassword = async (token, newPassword) => {
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpire: { $gt: Date.now() },
  });
  if (!user) throw new Error('Invalid or expired password reset token.');
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
};
