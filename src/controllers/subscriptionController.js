const catchAsync = require('../utils/catchAsync');
const subscriptionService = require('../services/subscriptionService');

exports.subscribe = catchAsync(async (req, res, next) => {
  const { planType } = req.body;

  const result = await subscriptionService.createStripeCheckout(
    req.user,
    planType
  );

  // Send the response exactly once
  res.status(200).json(result);
});

exports.cancel = catchAsync(async (req, res, next) => {
  const result = await subscriptionService.cancelSubscription(req.user.id);

  res.status(200).json({
    success: true,
    data: result,
  });
});

exports.stripeWebhook = catchAsync(async (req, res, next) => {
  const signature = req.headers['stripe-signature'];

  // We pass the raw body (req.body) and the signature to the service
  // The service will verify the signature and update the user in the DB
  await subscriptionService.handleWebhook(req.body, signature);

  // Stripe requires a 200 OK response to know the webhook was received
  res.status(200).json({ received: true });
});
