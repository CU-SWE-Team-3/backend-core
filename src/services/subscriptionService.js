const User = require('../models/userModel');
const AppError = require('../utils/appError');
const crypto = require('crypto');

exports.createMockCheckout = async (userId, planType) => {
  if (!['Pro', 'Go+'].includes(planType)) {
    throw new AppError('Invalid subscription plan selected.', 400);
  }

  const user = await User.findById(userId);
  if (user.isPremium && !user.cancelAtPeriodEnd) {
    throw new AppError('You are already an active premium subscriber.', 400);
  }

  // Simulate network delay for payment processing (e.g., 2 seconds)
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Generate a fake Stripe Customer/Subscription ID
  const mockSubId = `sub_mock_${crypto.randomBytes(8).toString('hex')}`;

  // Set subscription to exactly 30 days from now
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);

  user.isPremium = true;
  user.subscriptionPlan = planType;
  user.mockStripeId = mockSubId;
  user.subscriptionExpiresAt = expiryDate;
  user.cancelAtPeriodEnd = false; // Reset if they were previously cancelling
  
  await user.save();

  return {
    message: `Successfully upgraded to ${planType}!`,
    plan: user.subscriptionPlan,
    expiresAt: user.subscriptionExpiresAt,
    transactionId: mockSubId
  };
};

exports.cancelSubscription = async (userId) => {
  const user = await User.findById(userId);
  
  if (!user.isPremium) {
    throw new AppError('You do not have an active subscription.', 400);
  }

  // They retain premium access until the billing cycle ends
  user.cancelAtPeriodEnd = true;
  await user.save();

  return {
    message: 'Subscription cancelled. You will retain premium access until your billing cycle ends.',
    expiresAt: user.subscriptionExpiresAt
  };
};