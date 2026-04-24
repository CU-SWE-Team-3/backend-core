const cron = require('node-cron');
const Track = require('../models/trackModel');
const AppError = require('./appError');
const User = require('../models/userModel');

const startCronJobs = () => {
  // --------------------------------------------------------
  // 1. Abandoned Track Cleanup Cron (Runs daily at Midnight)
  // --------------------------------------------------------
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running daily cleanup for abandoned track uploads...');
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await Track.deleteMany({
        processingState: 'Processing',
        createdAt: { $lt: oneDayAgo },
      });
      if (result.deletedCount > 0) {
        console.log(
          `[Cron] Successfully deleted ${result.deletedCount} abandoned track records.`
        );
      }
    } catch (error) {
      const appError = new AppError(
        'Failed to clean up abandoned tracks.',
        500
      );
      console.error('[Cron Error]', appError.message, error);
    }
  });

  // --------------------------------------------------------
  // 2. Subscription Expiry Cron (Runs daily at 1:00 AM)
  // --------------------------------------------------------
  cron.schedule('0 1 * * *', async () => {
    try {
      const now = new Date();
      const expiredUsers = await User.updateMany(
        {
          isPremium: true,
          cancelAtPeriodEnd: true,
          subscriptionExpiresAt: { $lte: now },
        },
        {
          $set: {
            isPremium: false,
            subscriptionPlan: 'Free',
            mockStripeId: null,
            subscriptionExpiresAt: null,
            cancelAtPeriodEnd: false,
          },
        }
      );
      if (expiredUsers.modifiedCount > 0) {
        console.log(
          `[Cron] Demoted ${expiredUsers.modifiedCount} expired premium subscriptions.`
        );
      }
    } catch (error) {
      console.error(
        '[Cron Error] Failed to process subscription expirations:',
        error
      );
    }
  });
  cron.schedule('0 * * * *', async () => {
    console.log('📉 Applying Gravity to Viral Scores...');

    try {
      // Multiply every track's viral score by 0.95 (A 5% decay every hour)
      await Track.updateMany(
        { viralScore: { $gt: 0.1 } }, // Only update tracks that have a score
        { $mul: { viralScore: 0.95 } }
      );
    } catch (error) {
      console.error('Gravity Job Failed:', error);
    }
  });
};

// Export the single function that starts both jobs
module.exports = startCronJobs;
