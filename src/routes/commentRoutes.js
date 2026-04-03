const express = require('express');
const commentController = require('../controllers/commentController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.delete('/:commentId', protect, commentController.deleteComment);

module.exports = router;