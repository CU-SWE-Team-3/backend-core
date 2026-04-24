const express = require('express');
const feedController = require('../controllers/feedController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);
router.get('/', feedController.getActivityFeed);

module.exports = router;
