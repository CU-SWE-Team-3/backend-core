'use strict';
/**
 * 12_subscription.test.js
 * Module 12: Premium Subscription (Pro / Go+)
 * Tests subscriptionService (real) and subscriptionController (mocked)
 */

// ── Stripe mock — must be before any require('../services/subscriptionService')
jest.mock('stripe', () => {
  const mockStripe = {
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
    subscriptions: {
      update: jest.fn(),
      retrieve: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  };
  return jest.fn(() => mockStripe);
});

jest.mock('../models/userModel');
jest.mock('../utils/sendEmail');

const User = require('../models/userModel');
const sendEmail = require('../utils/sendEmail');

// Mock subscriptionService for controller tests
jest.mock('../services/subscriptionService');
const subscriptionService = require('../services/subscriptionService');
const subscriptionController = require('../controllers/subscriptionController');

const UID = '507f1f77bcf86cd799439011';
const STRIPE_SUB_ID = 'sub_test_123';
const STRIPE_CUSTOMER_ID = 'cus_test_456';

const mkRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json   = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// ─── subscriptionController ───────────────────────────────────────────────────
describe('subscriptionController', () => {
  test('subscribe — 200 with checkoutUrl', async () => {
    subscriptionService.createStripeCheckout.mockResolvedValue({ success: true, checkoutUrl: 'https://checkout.stripe.com/pay/session' });
    const r = mkRes();
    await subscriptionController.subscribe({ user: { role: 'Artist', isPremium: false, _id: UID }, body: { planType: 'Pro' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('cancel — 200 with message', async () => {
    subscriptionService.cancelSubscription.mockResolvedValue({ message: 'Cancelled', expiresAt: new Date() });
    const r = mkRes();
    await subscriptionController.cancel({ user: { id: UID, isPremium: true } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('stripeWebhook — 200 with received:true', async () => {
    subscriptionService.handleWebhook.mockResolvedValue(undefined);
    const r = mkRes();
    await subscriptionController.stripeWebhook({ body: Buffer.from('{}'), headers: { 'stripe-signature': 'sig' } }, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith({ received: true });
  });
});

// ─── subscriptionService REAL unit tests ──────────────────────────────────────
describe('subscriptionService (real)', () => {
  jest.unmock('../services/subscriptionService');
  const realSubscriptionService = jest.requireActual('../services/subscriptionService');

  // Get a reference to the stripe mock instance
  const stripe = require('stripe')();

  const mkUser = (overrides = {}) => ({
    _id: UID, email: 'dj@beats.com', displayName: 'DJ',
    role: 'Artist', isPremium: false, cancelAtPeriodEnd: false,
    stripeSubscriptionId: STRIPE_SUB_ID,
    subscriptionPlan: 'Free',
    subscriptionExpiresAt: null,
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_PRICE_PRO      = 'price_pro_test';
    process.env.STRIPE_PRICE_GO_PLUS  = 'price_goplus_test';
    process.env.FRONTEND_URL          = 'https://biobeats.app';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    sendEmail.mockResolvedValue({});
  });

  // ── createStripeCheckout ──────────────────────────────────────────────────
  test('createStripeCheckout — Artist → Pro plan creates session', async () => {
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/session' });
    const user = mkUser({ role: 'Artist', isPremium: false });
    const result = await realSubscriptionService.createStripeCheckout(user, 'Pro');
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: 'price_pro_test', quantity: 1 }] })
    );
    expect(result.checkoutUrl).toBe('https://checkout.stripe.com/session');
    expect(result.success).toBe(true);
  });

  test('createStripeCheckout — Listener → Go+ plan creates session', async () => {
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/session' });
    const user = mkUser({ role: 'Listener', isPremium: false });
    const result = await realSubscriptionService.createStripeCheckout(user, 'Go+');
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: 'price_goplus_test', quantity: 1 }] })
    );
    expect(result.success).toBe(true);
  });

  test('createStripeCheckout — throws 400 for invalid plan type', async () => {
    const user = mkUser({ role: 'Artist' });
    await expect(realSubscriptionService.createStripeCheckout(user, 'SuperPlan')).rejects.toThrow('Invalid plan type');
  });

  test('createStripeCheckout — throws 400 for Artist trying Go+', async () => {
    const user = mkUser({ role: 'Artist' });
    await expect(realSubscriptionService.createStripeCheckout(user, 'Go+')).rejects.toThrow('Invalid plan type');
  });

  test('createStripeCheckout — throws 400 when already active premium', async () => {
    const user = mkUser({ isPremium: true, cancelAtPeriodEnd: false });
    await expect(realSubscriptionService.createStripeCheckout(user, 'Pro')).rejects.toThrow('already an active premium subscriber');
  });

  test('createStripeCheckout — allows re-subscribe when cancelAtPeriodEnd is true', async () => {
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://stripe.com/session' });
    const user = mkUser({ isPremium: true, cancelAtPeriodEnd: true, role: 'Artist' });
    const result = await realSubscriptionService.createStripeCheckout(user, 'Pro');
    expect(result.success).toBe(true);
  });

  // ── cancelSubscription ────────────────────────────────────────────────────
  test('cancelSubscription — sets cancelAtPeriodEnd to true', async () => {
    stripe.subscriptions.update.mockResolvedValue({});
    const user = mkUser({ isPremium: true, stripeSubscriptionId: STRIPE_SUB_ID });
    User.findById.mockResolvedValue(user);
    const result = await realSubscriptionService.cancelSubscription(UID);
    expect(user.cancelAtPeriodEnd).toBe(true);
    expect(user.save).toHaveBeenCalled();
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(STRIPE_SUB_ID, { cancel_at_period_end: true });
    expect(result.message).toContain('cancelled');
  });

  test('cancelSubscription — throws 400 when user not premium', async () => {
    User.findById.mockResolvedValue(mkUser({ isPremium: false }));
    await expect(realSubscriptionService.cancelSubscription(UID)).rejects.toThrow('do not have an active subscription');
  });

  test('cancelSubscription — works without stripeSubscriptionId (no stripe call)', async () => {
    const user = mkUser({ isPremium: true, stripeSubscriptionId: null });
    User.findById.mockResolvedValue(user);
    const result = await realSubscriptionService.cancelSubscription(UID);
    expect(user.cancelAtPeriodEnd).toBe(true);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  // ── handleWebhook ─────────────────────────────────────────────────────────
  test('handleWebhook — throws 400 when signature verification fails', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => { throw new Error('bad sig'); });
    await expect(realSubscriptionService.handleWebhook(Buffer.from('{}'), 'bad-sig')).rejects.toThrow('signature verification failed');
  });

  test('handleWebhook — checkout.session.completed upgrades user to premium', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: UID, metadata: { planType: 'Pro' }, customer: STRIPE_CUSTOMER_ID, subscription: STRIPE_SUB_ID } },
    };
    stripe.webhooks.constructEvent.mockReturnValue(event);
    User.findByIdAndUpdate.mockResolvedValue({});
    await realSubscriptionService.handleWebhook(Buffer.from(JSON.stringify(event)), 'valid-sig');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(UID, expect.objectContaining({ isPremium: true, subscriptionPlan: 'Pro' }));
  });

  test('handleWebhook — invoice.payment_succeeded renews subscription', async () => {
    const event = {
      type: 'invoice.payment_succeeded',
      data: { object: { billing_reason: 'subscription_cycle', subscription: STRIPE_SUB_ID, customer_email: 'dj@test.com' } },
    };
    stripe.webhooks.constructEvent.mockReturnValue(event);
    stripe.subscriptions.retrieve.mockResolvedValue({ current_period_end: Math.floor(Date.now() / 1000) + 2592000 });
    User.findOneAndUpdate.mockResolvedValue({});
    await realSubscriptionService.handleWebhook(Buffer.from('{}'), 'valid-sig');
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { stripeSubscriptionId: STRIPE_SUB_ID },
      expect.objectContaining({ isPremium: true })
    );
  });

  test('handleWebhook — invoice.payment_succeeded ignores non-cycle invoices', async () => {
    const event = {
      type: 'invoice.payment_succeeded',
      data: { object: { billing_reason: 'manual', subscription: STRIPE_SUB_ID } },
    };
    stripe.webhooks.constructEvent.mockReturnValue(event);
    await realSubscriptionService.handleWebhook(Buffer.from('{}'), 'valid-sig');
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('handleWebhook — invoice.payment_failed revokes premium access', async () => {
    const event = {
      type: 'invoice.payment_failed',
      data: { object: { subscription: STRIPE_SUB_ID, customer_email: 'dj@test.com' } },
    };
    stripe.webhooks.constructEvent.mockReturnValue(event);
    User.findOneAndUpdate.mockResolvedValue({ email: 'dj@test.com', subscriptionPlan: 'Pro', name: 'DJ' });
    await realSubscriptionService.handleWebhook(Buffer.from('{}'), 'valid-sig');
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { stripeSubscriptionId: STRIPE_SUB_ID },
      { isPremium: false }
    );
    expect(sendEmail).toHaveBeenCalled();
  });

  test('handleWebhook — invoice.payment_failed handles null user gracefully', async () => {
    const event = {
      type: 'invoice.payment_failed',
      data: { object: { subscription: STRIPE_SUB_ID } },
    };
    stripe.webhooks.constructEvent.mockReturnValue(event);
    User.findOneAndUpdate.mockResolvedValue(null);
    await expect(realSubscriptionService.handleWebhook(Buffer.from('{}'), 'valid-sig')).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('handleWebhook — invoice.payment_failed continues when email fails', async () => {
    const event = {
      type: 'invoice.payment_failed',
      data: { object: { subscription: STRIPE_SUB_ID } },
    };
    stripe.webhooks.constructEvent.mockReturnValue(event);
    User.findOneAndUpdate.mockResolvedValue({ email: 'dj@test.com', subscriptionPlan: 'Pro', name: 'DJ' });
    sendEmail.mockRejectedValue(new Error('SMTP'));
    await expect(realSubscriptionService.handleWebhook(Buffer.from('{}'), 'valid-sig')).resolves.toBeUndefined();
  });

  // ── getRevenueStats ───────────────────────────────────────────────────────
  test('getRevenueStats — returns correct revenue breakdown', async () => {
    User.countDocuments
      .mockResolvedValueOnce(10) // Pro users
      .mockResolvedValueOnce(5);  // Go+ users
    const result = await realSubscriptionService.getRevenueStats();
    expect(result.proUsersCount).toBe(10);
    expect(result.goPlusUsersCount).toBe(5);
    expect(result.activeSubscriptions).toBe(15);
    expect(result.creatorRevenue).toBe(50);   // 10 × $5
    expect(result.listenerRevenue).toBe(50);  // 5 × $10
    expect(result.totalRevenue).toBe(100);
  });

  test('getRevenueStats — returns zeros when no subscribers', async () => {
    User.countDocuments.mockResolvedValue(0);
    const result = await realSubscriptionService.getRevenueStats();
    expect(result.totalRevenue).toBe(0);
    expect(result.activeSubscriptions).toBe(0);
  });
});
