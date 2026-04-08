const express = require('express');
const commentController = require('../controllers/commentController');
const { protect } = require('../middlewares/authMiddleware');
const { validate } = require('../validations/validationMiddleware');
const { deleteCommentSchema } = require('../validations/interactionValidation');

const router = express.Router();

router.delete(
  '/:commentId',
  protect,
  validate(deleteCommentSchema),
  commentController.deleteComment
);

module.exports = router;
