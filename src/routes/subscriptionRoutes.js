const express = require('express');
const subscriptionController = require('../controllers/subscriptionController');
const { protect } = require('../middlewares/authMiddleware');
const { validate } = require('../middlewares/validationMiddleware');
const { checkoutSchema } = require('../validations/subscriptionValidation'); // Import schema

const router = express.Router();

router.use(protect);

// Add the validate middleware here
router.post(
  '/checkout',
  validate(checkoutSchema),
  subscriptionController.subscribe
);
router.delete('/cancel', subscriptionController.cancel);

module.exports = router;
