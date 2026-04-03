const express = require('express');
const playerController = require('../controllers/playerController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware.protect);

router
  .route('/state')
  .get(playerController.getPlayerState)
  .put(playerController.updatePlayerState);

router.get('/:id/stream', playerController.getStreamingUrl);

module.exports = router;
