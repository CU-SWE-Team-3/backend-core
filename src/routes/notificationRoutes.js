// src/routes/notificationRoutes.js
const express = require('express');
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// ==========================================
// 1. Fetch Notification Feed (The Dropdown)
// ==========================================
router.get('/', protect, notificationController.getNotifications);

// ==========================================
// 2. Fetch Unread Badge Count (The Red Number)
// ==========================================
router.get('/unread-count', protect, notificationController.getUnreadCount);

// ==========================================
// 3. Mark All Notifications As Read
// ==========================================
router.patch('/mark-read', protect, notificationController.markAllAsRead);
router.patch('/:id/read', protect, notificationController.markOneAsRead);
// ==========================================
// 4. Delete a Notification
// ==========================================
router.delete('/:id', protect, notificationController.deleteNotification);

module.exports = router;
