const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
// const AppError = require('../utils/appError');

exports.protect = catchAsync(async (req, res, next) => {
  let token;

  if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  } else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  // 🟢 FIX 1: Send 401 directly if there is no token
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUser = await User.findById(decoded.id);

    // 🟢 FIX 2: Send 401 directly if the user was deleted
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    req.user = currentUser;

    // NEW: ACTIVE USER TRACKING (Ghost Town Fix)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (!req.user.lastActiveAt || req.user.lastActiveAt < oneHourAgo) {
      await User.findByIdAndUpdate(
        req.user._id,
        { lastActiveAt: new Date() },
        { timestamps: false }
      );
    }
    next();
  } catch (error) {
    // 🟢 FIX 3: Catch JWT errors (like expired tokens) and send 401 directly
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }
});

exports.optionalAuth = catchAsync(async (req, res, next) => {
  let token;

  // 1. Check if token exists in cookies or headers
  if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  } else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  // 2. If NO token, they are a guest. Do NOT throw an error. Just move to next()
  if (!token) {
    req.user = null;
    return next();
  }

  // 3. If they DO have a token, try to verify it
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUser = await User.findById(decoded.id);

    // If user was deleted since token was made, treat as guest
    if (!currentUser) {
      req.user = null;
      return next();
    }

    // Success! Attach the user to the request
    req.user = currentUser;
    next();
  } catch (error) {
    // If token is invalid or expired, just treat them as a guest instead of crashing
    req.user = null;
    next();
  }
});
