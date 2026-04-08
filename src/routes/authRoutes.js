const express = require('express');
const authController = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');
const { validate } = require('../validations/validationMiddleware');
const {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  emailOnlySchema,
  resetPasswordSchema,
  requestEmailUpdateSchema,
  confirmEmailUpdateSchema,
  googleMobileSchema,
} = require('../validations/authValidation');

const router = express.Router();

router.get('/google', authController.getGoogleAuthUrl);
router.get('/google/callback', authController.handleGoogleCallback);

router.post('/refresh', authController.refreshToken);
router.post(
  '/google/mobile',
  validate(googleMobileSchema),
  authController.loginWithGoogleMobile
);
router.post('/logout', protect, authController.logout);
router.post('/login', validate(loginSchema), authController.login);
router.post('/register', validate(registerSchema), authController.register);
router.post(
  '/verify-email',
  validate(verifyEmailSchema),
  authController.verifyEmail
);

router.post(
  '/resend-verification',
  validate(emailOnlySchema),
  authController.resendVerification
);
router.patch(
  '/update-email',
  protect,
  validate(requestEmailUpdateSchema),
  authController.requestEmailUpdate
);
router.post(
  '/confirm-email-update',
  validate(confirmEmailUpdateSchema),
  authController.confirmEmailUpdate
);

router.post(
  '/forgot-password',
  validate(emailOnlySchema),
  authController.forgotPassword
);
router.patch(
  '/reset-password',
  validate(resetPasswordSchema),
  authController.resetPassword
);

module.exports = router;
