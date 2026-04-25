// src/routes/notificationRoutes.js
const express = require('express');
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// ==========================================
// STATIC ROUTES (Must go first!)
// ==========================================

// 1. Fetch Notification Feed
router.get('/', protect, notificationController.getNotifications);

// 2. Fetch Unread Badge Count
router.get('/unread-count', protect, notificationController.getUnreadCount);

// 3. Mark All Notifications As Read
router.patch('/mark-read', protect, notificationController.markAllAsRead);

// 4. DEVELOPER D: Device Token Management
router.post('/fcm-token', protect, notificationController.registerFcmToken);
router.delete('/fcm-token', protect, notificationController.removeFcmToken);

// 5. DEVELOPER D: Notification Preferences
router.patch('/preferences', protect, notificationController.updatePreferences);

// ==========================================
// DYNAMIC ROUTES (Must go last!)
// ==========================================

// 6. Mark One Notification As Read
router.patch('/:id/read', protect, notificationController.markOneAsRead);

// 7. Delete a Notification
router.delete('/:id', protect, notificationController.deleteNotification);

module.exports = router;