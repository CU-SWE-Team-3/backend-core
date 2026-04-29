const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const sendEmail = require('../utils/sendEmail');

exports.createStripeCheckout = async (user, planType) => {
  // 1. Guard check
  if (user.isPremium && !user.cancelAtPeriodEnd) {
    throw new AppError('You are already an active premium subscriber.', 400);
  }

  // 2. Map the requested plan to the actual Stripe Price ID
  let priceId;
  if (planType === 'Pro' && user.role === 'Artist')
    priceId = process.env.STRIPE_PRICE_PRO;
  else if (planType === 'Go+' && user.role === 'Listener')
    priceId = process.env.STRIPE_PRICE_GO_PLUS;
  else throw new AppError('Invalid plan type', 400);

  // 3. Create the Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    customer_email: user.email, // Pre-fills their email on the checkout page
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    // client_reference_id is CRITICAL: It passes your database User ID to Stripe,
    // so Stripe can send it back to you in the webhook!
    client_reference_id: user._id.toString(),
    success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/payment-cancelled`,
    metadata: { planType }, // Pass the plan type so the webhook knows what they bought
  });

  // 4. Return the Stripe URL to the frontend
  return {
    success: true,
    checkoutUrl: session.url,
  };
};

exports.cancelSubscription = async (userId) => {
  const user = await User.findById(userId);

  if (!user.isPremium) {
    throw new AppError('You do not have an active subscription.', 400);
  }

  // They retain premium access until the billing cycle ends
  user.cancelAtPeriodEnd = true;
  // Tell Stripe to cancel the subscription at the end of the current billing month
  if (user.stripeSubscriptionId) {
    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }
  await user.save();

  return {
    message:
      'Subscription cancelled. You will retain premium access until your billing cycle ends.',
    expiresAt: user.subscriptionExpiresAt,
  };
};

exports.handleWebhook = async (rawBody, signature) => {
  let event;

  try {
    // 1. Verify the event came from Stripe (Security Check)
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`❌ Webhook signature verification failed: ${err.message}`);
    throw new AppError('Webhook signature verification failed', 400);
  }

  // 2. Handle the specific event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // 3. Extract the data we sent earlier in createStripeCheckout
    const userId = session.client_reference_id;
    const { planType } = session.metadata;
    const stripeCustomerId = session.customer;
    const stripeSubscriptionId = session.subscription;

    // 4. Update the User in MongoDB
    // We set isPremium to true and set the expiry to 30 days from now
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    await User.findByIdAndUpdate(userId, {
      isPremium: true,
      subscriptionPlan: planType,
      stripeCustomerId: stripeCustomerId,
      stripeSubscriptionId: stripeSubscriptionId,
      subscriptionExpiresAt: expiryDate,
      cancelAtPeriodEnd: false,
    });

    console.log(
      `✅ [Stripe] Successfully upgraded User ${userId} to ${planType}`
    );
  }
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object;

    // We only care about recurring billing cycles here
    if (invoice.billing_reason === 'subscription_cycle') {
      const subscription = await stripe.subscriptions.retrieve(
        invoice.subscription
      );

      await User.findOneAndUpdate(
        { stripeSubscriptionId: invoice.subscription },
        {
          isPremium: true,
          // Convert Stripe seconds to JS milliseconds
          subscriptionExpiresAt: new Date(
            subscription.current_period_end * 1000
          ),
          cancelAtPeriodEnd: false,
        }
      );
      console.log(`✅ Subscription renewed for ${invoice.customer_email}`);
    }
  }

  // B. Handle Payment Failure
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;

    // Revoke premium access immediately
    const user = await User.findOneAndUpdate(
      { stripeSubscriptionId: invoice.subscription },
      { isPremium: false }
    );

    if (user) {
      console.log(`❌ Payment failed for ${user.email}. Access revoked.`);

      // 2. Trigger the Email
      try {
        await sendEmail({
          email: user.email,
          subject: 'Urgent: Payment for your Premium subscription failed',
          message: `Hi ${user.name || 'there'},\n\nWe were unable to process your recurring payment for the ${user.subscriptionPlan} plan. Your premium access has been suspended. Please log in and update your payment method to restore your features.\n\nThank you!`,
        });
        console.log(`📧 Notification email sent to ${user.email}`);
      } catch (err) {
        console.error(
          `Internal Error: Could not send failure email: ${err.message}`
        );
      }
    }
  }
};

// Add this at the bottom of subscriptionService.js

exports.getRevenueStats = async () => {
  // Define your plan prices
  const PRO_PRICE = 5;
  const GOPLUS_PRICE = 10;

  // Count active subscriptions directly from the User model
  const proUsersCount = await User.countDocuments({
    subscriptionPlan: 'Pro',
    isPremium: true,
  });
  const goPlusUsersCount = await User.countDocuments({
    subscriptionPlan: 'Go+',
    isPremium: true,
  });

  const creatorRevenue = proUsersCount * PRO_PRICE;
  const listenerRevenue = goPlusUsersCount * GOPLUS_PRICE;

  return {
    activeSubscriptions: proUsersCount + goPlusUsersCount,
    totalRevenue: creatorRevenue + listenerRevenue,
    proUsersCount,
    goPlusUsersCount,
    creatorRevenue,
    listenerRevenue,
  };
};
