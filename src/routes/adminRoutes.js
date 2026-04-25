// src/routes/adminRoutes.js
const express = require('express');
const adminController = require('../controllers/adminController');
const { protect } = require('../middlewares/authMiddleware');
const { validate } = require('../middlewares/validationMiddleware');
const adminValidation = require('../validations/adminValidation');

const router = express.Router();

// User-facing route: Submit a report
router.post(
  '/reports',
  protect,
  validate(adminValidation.submitReportSchema), // <-- Updated name
  adminController.submitReport
);

// Admin-only middleware
const restrictToAdmin = (req, res, next) => {
  if (req.user.role !== 'Admin') {
    return res
      .status(403)
      .json({ success: false, message: 'Admin access required' });
  }
  next();
};

router.use(protect, restrictToAdmin); // Apply to all routes below

// Analytics Dashboard
router.get('/stats', adminController.getDashboardStats);

// Moderation
router.get('/reports', adminController.getReports);

router.patch(
  '/users/:id/suspend',
  validate(adminValidation.idParamSchema), // <-- Updated name
  adminController.suspendUser
);

router.patch(
  '/tracks/:id/hide',
  validate(adminValidation.idParamSchema), // <-- Updated name
  adminController.hideTrackContent
);

// Update Report Status
router.patch(
  '/reports/:id/status',
  validate(adminValidation.updateReportStatusSchema), // <-- Updated name
  adminController.resolveReport
);

// Undo actions (Restore)
router.patch(
  '/users/:id/restore',
  validate(adminValidation.idParamSchema), // <-- Updated name
  adminController.restoreUser
);

router.patch(
  '/tracks/:id/restore',
  validate(adminValidation.idParamSchema), // <-- Updated name
  adminController.restoreTrackContent
);
router.post('/broadcast', protect, adminController.broadcastToAllUsers);

// --- APPEND TO BOTTOM OF FILE ---

// Content Management Endpoints
router.get('/tracks', adminController.getAdminTracks);
router.get('/users', adminController.getAdminUsers);

// Health & Stats Endpoints
router.get('/stats/daily-users', adminController.getDailyActiveUsers);
router.get('/stats/top-tracks', adminController.getTopTracks);

// User Warning Endpoint
// Uses your existing idParamSchema from adminValidation.js
router.post(
  '/users/:id/warn',
  validate(adminValidation.idParamSchema),
  adminController.warnUser
);

module.exports = router;
