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
    next();
  } catch (error) {
    // 🟢 FIX 3: Catch JWT errors (like expired tokens) and send 401 directly
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }
});
