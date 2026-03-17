const express = require('express');
const authController = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/google', authController.getGoogleAuthUrl);
router.get('/google/callback', authController.handleGoogleCallback);
router.post('/refresh', authController.refreshToken);
router.post('/google/mobile', authController.loginWithGoogleMobile);
router.post('/logout', protect, authController.logout);
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/verify-email', authController.verifyEmail);

// NEW
router.post('/resend-verification', authController.resendVerification);
router.patch('/update-email', protect, authController.requestEmailUpdate);
router.post('/confirm-email-update', authController.confirmEmailUpdate);

router.post('/forgot-password', authController.forgotPassword);
router.patch('/reset-password', authController.resetPassword);

module.exports = router;
