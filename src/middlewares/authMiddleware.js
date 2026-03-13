// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

exports.protect = async (req, res, next) => {
  try {
    let token;

    // 1. Check if the token exists in the headers
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      // The header looks like: "Bearer eyJhbGciOi..."
      // We split it by the space and grab the second part (the actual token)
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route. No token provided.',
      });
    }

    // 2. Verify the token mathematically (Did we issue it? Has it expired?)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Find the user in the database using the ID inside the token
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        error: 'The user belonging to this token no longer exists.',
      });
    }

    // 4. Attach the user object to the request
    req.user = currentUser;

    // 5. Grant access to the protected route
    next();
  } catch (error) {
    console.error('🔥 Protect Middleware Error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Not authorized. Token failed or expired.',
    });
  }
};
