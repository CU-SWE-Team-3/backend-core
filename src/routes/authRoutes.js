const express = require('express');
const authController = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware'); // NEW

const router = express.Router();

// ==========================================
// 1. IDENTITY & AUTHENTICATION (BE-2)
// ==========================================
router.get('/google', authController.getGoogleAuthUrl);
router.get('/google/callback', authController.handleGoogleCallback);
router.post('/refresh', authController.refreshToken);
router.post('/google/mobile', authController.loginWithGoogleMobile);

// NEW: Logout route (Protected so only logged-in users can access it)
router.post('/logout', protect, authController.logout);

// ==========================================
// 3. REGISTRATION, VERIFICATION & RECOVERY (BE-1)
// ==========================================
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/verify-email', authController.verifyEmail);
router.post('/forgot-password', authController.forgotPassword);
router.patch('/reset-password', authController.resetPassword);

module.exports = router;
