const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/userModel');

exports.stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify the request actually came from Stripe
    event = stripe.webhooks.constructEvent(
      req.body, // This must be raw body!
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the successful payment
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id; // We passed this earlier!
    const planType = session.metadata.planType;

    // UPGRADE THE USER IN YOUR DATABASE
    await User.findByIdAndUpdate(userId, {
      isPremium: true,
      subscriptionPlan: planType,
      stripeCustomerId: session.customer,
      stripeSubscriptionId: session.subscription,
      cancelAtPeriodEnd: false,
      // Stripe uses timestamps (seconds), JS uses milliseconds
      subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) 
    });

    console.log(`[Stripe] Successfully upgraded User ${userId} to ${planType}`);
  }

  // Acknowledge receipt to Stripe
  res.json({ received: true });
};