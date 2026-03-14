const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

exports.protect = async (req, res, next) => {
  try {
    let token;

    // 1. Look for the token inside the secure HttpOnly cookies FIRST
    if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }
    // Fallback: Check headers just in case you are testing via Postman Authorization tab
    else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route. No token provided.',
      });
    }

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Find user
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        error: 'The user belonging to this token no longer exists.',
      });
    }

    // 4. Grant access
    req.user = currentUser;
    next();
  } catch (error) {
    console.error('🔥 Protect Middleware Error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Not authorized. Token failed or expired.',
    });
  }
};
