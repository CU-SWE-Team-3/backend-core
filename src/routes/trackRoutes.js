const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const trackController = require('../controllers/trackController');

const router = express.Router();

// 1. Direct-to-Cloud Upload Pipeline
router.post('/upload', protect, trackController.initiateUpload);
router.patch('/:id/confirm', protect, trackController.confirmUpload);

// 2. Fetch & Stream (Public)
router.get('/:permalink', trackController.getTrack);

// 3. Premium Offline Download (Protected)
router.get('/:id/download', protect, trackController.downloadTrack);

// 4. Delete Track (Protected - Owner only)
router.delete('/:id', protect, trackController.deleteTrack);

module.exports = router;
