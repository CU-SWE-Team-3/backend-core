// src/routes/auth.routes.js
const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

// ==========================================
// 1. IDENTITY & AUTHENTICATION (BE-2)
// ==========================================

// GET: /api/auth/google -> Returns the Google login URL
router.get('/google', authController.getGoogleAuthUrl);

// GET: /api/auth/google/callback -> Handles the redirect from Google
router.get('/google/callback', authController.handleGoogleCallback);

// POST: /api/auth/refresh -> Rotates the JWT session tokens
router.post('/refresh', authController.refreshToken);

// POST: /api/auth/google/mobile -> Handles raw idTokens from Android/iOS
router.post('/google/mobile', authController.loginWithGoogleMobile);

// Note: BE-1 will add POST /register and POST /login here later

module.exports = router;
