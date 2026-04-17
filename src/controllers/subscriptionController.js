const catchAsync = require('../utils/catchAsync');
const subscriptionService = require('../services/subscriptionService');

exports.subscribe = catchAsync(async (req, res, next) => {
  const { planType } = req.body;
  const result = await subscriptionService.createMockCheckout(req.user.id, planType);

  res.status(200).json({
    success: true,
    data: result
  });
});

exports.cancel = catchAsync(async (req, res, next) => {
  const result = await subscriptionService.cancelSubscription(req.user.id);

  res.status(200).json({
    success: true,
    data: result
  });
});